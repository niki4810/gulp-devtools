var http = require("http"),
  url = require('url'),
  fs = require("fs"),
  io = require('socket.io'),
  spawn = require('child_process').spawn,
  _ = require('lodash'),
  path = require("path"),
  mime = require('mime');

var gulpDevTools = function () {
  var gulpFilePath = path.join(process.cwd(), "gulpfile");
  var gulpFile = require(gulpFilePath);
  var gulpTasks = Object.keys(gulpFile.tasks).sort();
  if (gulpTasks && gulpTasks.length > 0) {
    process.stdout.write("Gulp Tasks loaded, fire up your chrome devtools\n");
  } else {
    process.stdout.write("Could not load gulp tasks\n");
  }

  var server = http.createServer(function (request, response) {
      var requestPath = url.parse(request.url).pathname;
      var filePath = __dirname + '/../chrome-extension' + requestPath;
      var contentType = mime.lookup(filePath);
      fs.exists(filePath, function (exists) {
        if(exists){
          fs.readFile(filePath, function (error, data) {
            if (error) {
              response.writeHead(404);
              response.write("oops this doesn't exist - 404");
              response.end();
            }
            else {
              response.writeHead(200, {'Content-Type': contentType});
              response.write(data, "utf8");
              response.end();
            }
          });
        }else{
          response.writeHead(404);
          response.write("oops this doesn't exist - 404");
          response.end();
        }
      });
  });

  server.listen(8001);

  var sio = io.listen(server);
  var workers = [];

  //turn off debug
  sio.set('log level', 1);

  sio.sockets.on('connection', function (socket) {

    socket.emit('onGulpTasksLoaded', {
      'tasks': gulpTasks
    });

    //kill the task
    socket.on('killTask', function (data) {
      _.each(workers, function (worker) {
        if (worker.pid === data.pid) {
          worker.kill();
        }
      });
      workers = _.remove(workers, function (worker) {
        return worker.pid !== data.pid;
      });
    });

    //Run the task
    socket.on('runTask', function (data) {
      //log about the running task
      process.stdout.write("Running Task:" + data.taskName + "\n");

      //current task
      var currentTask = data.taskName;
      //spawn a new process      
      var spawnCmd = (process.platform === 'win32') ? 'gulp.cmd' : 'gulp';
      var worker = spawn(spawnCmd, [data.taskName]);
      workers.push(worker);

      //set the character encoding
      worker.stdout.setEncoding('utf-8');

      //when process is running log the output
      worker.stdout.on('data', function (data) {
        if (data) {
          var evtObj = {
            'message': data + '\n',
            'pid': worker.pid
          };
          if(currentTask && currentTask !== ""){
            evtObj.taskName = currentTask;
          }
          socket.emit('onProcessRunning', evtObj);
        }

      });

      //when the process ends
      worker.stdout.on('end', function (data) {
        socket.emit('onProcessFinish', {
          'message': worker.pid + " process completed",
          'pid': worker.pid
        });
      });

      //when there is an error
      worker.stderr.on('data', function (data) {
        if (data) {
          socket.emit('onProcessError', {
            'message': "",
            'pid': worker.pid
          });
        }
      });

      //when the process exits
      worker.on('exit', function (code) {
        if (code !== 0) {
          socket.emit('onProcessExit', {
            'message': worker.pid + '|' + 'Process Exited with code: ' + code,
            'pid': worker.pid
          });
        }
      });
    });
  });
};

exports.init = gulpDevTools;
