var express = require('express');
var parser = require('body-parser');
var cors = require('cors');
var socket = require('socket.io');
var http = require('http');
var _ = require('lodash');

var middlewares = require('./middlewares');

var PassThrough = require('stream').PassThrough;
var radioStream = new PassThrough();

var Recorder = require('./recorder');

var recorder = new Recorder(radioStream);

var app = express();

app.use(cors());

app.get('/chunks', function(req, res, next) {
    res.send(chunks);
});
app.get('/recordings', function(req, res, next) {
    res.send(recordings);
});
app.get('/stream', function(req, res, next) {
    radioStream.pipe(res);
});

app.use('/samples', express.static('samples'));
app.use(express.static('public'));

if(process.env.NODE_ENV !== 'production') {
    app.use(middlewares.logRequest);
}

app.use(middlewares.clientError);
app.use(middlewares.serverError);

var server = http.createServer(app);
var io = socket(server);

// use io.emit(event) to send a message to all connected clients
var chunks = [];
var recordings = [];

recorder.on('chunk', function(chunk) {
    chunks.push(chunk);
    io.emit('chunk', chunk);
});

recorder.on('record:start', function(time) {
    io.emit('record:start', time);
});

recorder.on('record:stop', function(recording) {
    recordings.push(recording);
    io.emit('record:stop', recording);
});

var STORAGE_LENGTH = 144000; // equals to ~10 hours of chunk data = ~45MB in memory
var BUFFER_LENGTH = 23800; // additional ~2 hours of buffer = ~20MB in memory

// every 30 seconds check if the buffer isn't full
setInterval(function() {
    if(chunks.length > STORAGE_LENGTH) {
        chunks = chunks.splice(chunks.length - (STORAGE_LENGTH - BUFFER_LENGTH), chunks.length);

        var time = chunks[0].time;

        // discard old recordings
        recordings = _.filter(recordings, function(recording) {
            return recording.stop >= time;
        });

        io.emit('discard', time);
    }
}, 30000);

server.listen(process.env.PORT || 5000, function() {
    console.log("Express server listening on port %d", server.address().port);
});
