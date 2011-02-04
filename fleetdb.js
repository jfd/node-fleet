//
//  node-fleet
//  A fleetdb client for Node.js
//  
//  Read README for instructions and LICENSE license.
//  
//  Copyright (c) 2010 Johan Dahlberg
//  Copyright (c) 2011 Judson Stephenson
//
var net = require('net'),
    url = require('url'),
    sys = require('sys');

var KILL_TIMEOUT = 500;

var Database = exports.Database = function ()
{
	var self = this;
	var options = {
		queue: [],
		q_stack: [],
		conn: null,
		kill_signal: false,
		auto_kill_pid: false
	};
	
	self.options = options;

	return self;
};

Database.prototype = {
	constructor: Database
};

Database.prototype.open = function (uri, callback)
{
	var self = this;
	var o	 = self.options;
	
  	var addr = url.parse(uri);  	
  	var port = addr.port || 3400,
      	addr = addr.url || '127.0.0.1';
		
	o.conn = net.createConnection(port, addr);
  	o.conn.setEncoding('utf8');

	o.conn.on('connect', function() {
		var q = o.queue.pop();
		if(q != null)
		{
			o.conn.write(q);
		}
	});

	o.conn.on('data', function(data) {

	    try {
			var obj = JSON.parse(data);
	    } catch (SyntaxError) {
	      console.log('Invalid JSON:');
	      console.log(data);
	      return false;
	    }
		var callback = o.q_stack.pop();
		callback(obj[0], obj[1]);
				
		if (o.kill_signal && o.q_stack.length == 0) {
			if(o.conn != null)
			{
				o.conn.destroy();
				o.conn = null;
			}
			if (o.auto_kill_pid != 0) {
				clearTimeout(o.auto_kill_pid);
			}
		} else
		{
			var q = o.queue.pop();
			if((o.conn != null) && (q != null))
			{
				o.conn.write(q);
			}			
		}
	});

	o.conn.addListener('timeout', function(data) {
		err_callback('timeout');
	});
	
};

/**
 *  Query the  fleetdb server. The optional ««callback«« is called when
 *  the server returns a response.
 */
Database.prototype.query = function(q, callback)
{
	var self = this;
	var o	 = self.options;
	
	var data = JSON.stringify(q) + '\r\n';
	o.q_stack.push(callback);
	
	if (o.conn.readyState == 'open') {
		o.conn.write(data);
	} else {
		o.queue.push(data);
	}
}

/**
 *  Close the established connection with the server.
 */
Database.prototype.close = function()
{
	var self = this;
	var o	 = self.options;
	
	if (o.q_stack.length) {
		// We are still waiting for some server responses. Handle them, then 
		// kill the connection.
		o.kill_signal = true;

		// Kill anyway after KILL_TIMEOUT seconds.
		o.auto_kill_pid = setTimeout(function() {
			if (o.conn != null) {
				o.conn.destroy();
				o.conn = null;
			}
		}, KILL_TIMEOUT);
	} else {
		if (o.conn != null) {
			o.conn.destroy();
			o.conn = null;
		}
	}
}