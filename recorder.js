var icy = require('icy');
var lame = require('lame');
var Waveform = require('audio-render');
var fs = require('fs');
var _ = require('lodash');
var slackAPI = require('slackbotapi');
var mean = require('compute-incrmmean');

var util = require('util');
var threshold, thresholdLatency;
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

if(!process.env.THRESHOLD) {
    throw new Error('Missing THRESHOLD environment variable.');
} else {
    threshold = parseInt(process.env.THRESHOLD);
}

if(!process.env.THRESHOLD_LATENCY) {
    throw new Error('Missing THRESHOLD_LATENCY environment variable.');
} else {
    thresholdLatency = parseInt(process.env.THRESHOLD_LATENCY);
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

var framesPerSecond = 8;
var rmsAvg = mean(thresholdLatency * framesPerSecond);

Recorder.prototype.start = function() {
    icy.get(url, function(res) {
        var renderer = Waveform({
            size: 44100,
            // offset: 0,
            bufferSize: 44100 * 5,
            framesPerSecond: framesPerSecond,
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

        this.notify = true;

        this.toggleNotify = function() {
            this.notify = !this.notify;
        };

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

            if(isNaN(loudness)) {
                return;
            }

            rmsAvg(loudness);

            threshold = parseInt(process.env.THRESHOLD) + rmsAvg();

            var now = Date.now();

            self.emit('chunk', {
                time: now,
                loudness: loudness,
                threshold: threshold
            });

            if(loudness > threshold) {
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

        res.on('end', function() {
            throw new Error('icy stream ended');
        });

        res.on('error', function(error) {
            throw error;
        });

        function prestartRecording(now) {
            recordTrial++;
            clearTimeout(prerecordingTimeout);

            // reset trials after 1 second
            prerecordingTimeout = setTimeout(function() {
                recordTrial = 0;
            }, 500);

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
                recording = true;
            }

            clearTimeout(recordingTimeout);
            recordingTimeout = setTimeout(stopRecording.bind(this), 4000);
        }

        function stopRecording() {
            var finishedAt = Date.now();
            recording = false;
            this.emit('record:stop', {
                start: startedAt,
                stop: finishedAt,
                file: filename
            });
            if(this.notify) {
                slack.sendMsg(channel, 'Wyłem przez ' + Math.round((finishedAt - startedAt) / 1000) + ' sekund!\nhttp://homecast.kjakubik.pl/samples/' + filename);
            }
            res.unpipe(writeStream);
            writeStream.end();
            writeStream = null;
        }
    }.bind(this));
};

module.exports = Recorder;
