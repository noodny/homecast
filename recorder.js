var icy = require('icy');
var lame = require('lame');
var Waveform = require('audio-render');
var fs = require('fs');
var _ = require('lodash');
var slackAPI = require('slackbotapi');

var util = require('util');
var EventEmitter = require('events').EventEmitter;

if(process.env.SLACK_TOKEN && process.env.SLACK_CHANNEL) {
    var slack = new slackAPI({
        'token': process.env.SLACK_TOKEN,
        'logging': (process.env.DEBUG || false),
        'autoReconnect': true
    });
}

if(!process.env.ICECAST_URI) {
    throw new Error('Missing ICECAST_URI environment variable.');
}

var url = process.env.ICECAST_URI;

var Recorder = function(outputStream) {
    if(outputStream) {
        this.stream = outputStream;
    }

    EventEmitter.call(this);
    this.start();
};

util.inherits(Recorder, EventEmitter);

Recorder.prototype.start = function() {
    icy.get(url, function(res) {
        var renderer = Waveform({
            size: 44100,
            // offset: 0,
            bufferSize: 44100 * 5,
            framesPerSecond: 4,
            minDecibels: -100,
            maxDecibels: 0,
            smoothingTimeConstant: 0.3
        });

        var recording = false;
        var filename;
        var startedAt;
        var recordAfter = 4;
        var recordTrial = 0;
        var writeStream;
        var recordingTimeout;
        var prerecordingTimeout;
        var channel = process.env.SLACK_CHANNEL;
        var self = this;

        renderer.render = function(canvas, data) {
            if(!data) {
                return;
            }

            var offset = this.offset;

            if(offset == null) {
                offset = data.length - this.size;
                if(offset < 0) offset = 0;
            }

            var frameData = data.slice(offset, offset + this.size);

            // relative loudness in % of loudness scale
            var loudness = Math.round(_.mean(_.map(frameData, Math.abs)) * 10000) / 100;

            var now = Date.now();

            self.emit('chunk', {
                time: now,
                loudness: loudness
            });

            if(loudness > 2) {
                prestartRecording.call(self, now);
            }
        };

        var decoder = new lame.Decoder();

        if(this.stream) {
            res.pipe(this.stream);
        }

        res.pipe(decoder).on('data', function(chunk) {
            renderer.write(chunk);
        });

        function prestartRecording(now) {
            recordTrial++;
            clearTimeout(prerecordingTimeout);

            // reset trials after 1 second
            prerecordingTimeout = setTimeout(function() {
                recordTrial = 0;
            }, 1000);

            // actually start recording if there were `recordAfter` recording trials in 1 seconds window
            if(recordTrial === recordAfter) {
                recordTrial = 0;
                startRecording.call(this, now);
            }
        }

        function startRecording(now) {
            if(!recording) {
                startedAt = now;
                filename = startedAt + '.mp3';
                writeStream = fs.createWriteStream('./samples/' + filename);
                res.pipe(writeStream);
                this.emit('record:start', startedAt);
                slack.sendMsg(channel, 'Zacząłem wyć!');
                recording = true;
            }

            clearTimeout(recordingTimeout);
            recordingTimeout = setTimeout(stopRecording.bind(this), 2000);
        }

        function stopRecording() {
            recording = false;
            this.emit('record:stop', {
                start: startedAt,
                stop: Date.now(),
                file: filename
            });
            slack.sendMsg(channel, 'Skończyłem wyć!');
            res.unpipe(writeStream);
            writeStream.end();
            writeStream = null;
        }
    }.bind(this));
};

module.exports = Recorder;
