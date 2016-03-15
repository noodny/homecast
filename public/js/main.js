$(document).ready(function() {
    var $track = $('.track .chunks');
    var socket = io();

    function renderChunks(chunks) {
        chunks.forEach(function(chunk) {
            $track.append('<div class="chunk" style="height: ' + chunk.loudness * 10 + '%"></div>');
        });
        $track.scrollLeft(($track.scrollLeft() + chunks.length));
    }

    function renderRecordings(recordings) {

    }

    $.when($.get('/chunks'), $.get('/recordings')).done(function(chunks, recordings) {
        renderChunks(chunks[0]);
        renderRecordings(recordings[0]);

        socket.on('chunk', function(chunk) {
            $track.append('<div class="chunk" data-time="' + chunk.time + '" style="height: ' + chunk.loudness * 10 + '%"></div>');
            $track.scrollLeft(($track.scrollLeft() + 1));
        });
    });

    $(document).on('click', '.audio', function(event) {
        event.preventDefault();
        if($(this).hasClass('playing')) {
            var audio = $(this).children('audio')[0];
            $(this).removeClass('playing');
            audio.pause();
            audio.currentTime = 0;
            audio.load();
        } else {
            var $playing = $('.audio.playing');

            if($playing.length) {
                var audio = $playing.children('audio')[0];
                $playing.removeClass('playing');

                audio.pause();
                audio.currentTime = 0;
                audio.load();
            }

            $(this).addClass('playing').children('audio')[0].play();
        }
    });
});
