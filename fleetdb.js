//
//  node-fleet
//  A FleetDB client for Node.js
//  
//  Read README for instructions and LICENSE license.
//  
//  Copyright (c) 2010 Johan Dahlberg 
//
var tcp = require('tcp'),
    uri = require('uri');

var KILL_TIMEOUT = 2000;

exports.open = function(uri_addr, err_callback) {
  var addr = uri.parse(uri_addr);
  var port = addr.port || 3400,
      addr = addr.url || '127.0.0.1',      
      queue = [],
      q_stack = [],
      conn = tcp.createConnection(port, addr),
      kill_signal = false,
      auto_kill_pid = 0;

  conn.setEncoding('utf8');

  conn.addListener('connect', function() {
    var q = null;
    while ((q = queue.pop())) {
      conn.send(q);
    }
  });

  conn.addListener('receive', function(data) {
    var obj = JSON.parse(data);
    var callback = q_stack.pop();
    callback(obj[0], obj[1]);
    if (kill_signal && q_stack.length == 0) {
      conn.close();
      conn = null;
      if (auto_kill_pid != 0) {
        clearTimeout(auto_kill_pid);
      }
    }
  });

  conn.addListener('timeout', function(data) {
    err_callback('timeout');
  });

  return {

    /**
     *  Query the  FleetDB server. The optional ´´callback´´ is called when
     *  the server returns a response.
     */
    query: function(q, callback) {
      var data = JSON.stringify(q) + '\r\n';
      q_stack.push(callback || function() {});
      if (conn.readyState == 'open') {
        conn.send(data);
      } else {
        queue.push(data);
      }
    },

    /**
     *  Close the established connection with the server.
     */
    close: function() {
      if (q_stack.length) {
        // We are still waiting for some server responses. Handle them, then 
        // kill the connection.
        kill_signal = true;
        
        // Kill anyway after KILL_TIMEOUT seconds.
        auto_kill_pid = setTimeout(function() {
          if (conn != null) {
            conn.close();
            conn = null;
          }
        }, KILL_TIMEOUT);
      } else {
        conn.close();
        conn = null;
      }
    }
    
  }

}