$(document).ready(function() {
    var $track = $('.track .chunks');
    var socket = io();

    function renderChunks(chunks) {
        chunks.forEach(function(chunk) {
            $track.append('<div data-time="' + chunk.time + '" class="chunk ' + (chunk.loudness > 2 ? 'loud' : '') + '" style="height: ' + chunk.loudness * 10 + '%"></div>');
        });
        $track.scrollLeft(($track.scrollLeft() + chunks.length));
    }

    function renderRecordings(recordings) {
        recordings.forEach(function(recording) {
            $track.find('[data-time="' + recording.start + '"]').append('<a class="audio"><audio src="/samples/' + recording.file + '"></audio></a>');
        });
    }

    function setThreshold(threshold) {
        $('.threshold').css('top', ($('.chunks-wrapper').height() - $('.chunks-wrapper').height() * (threshold / 10)) + 'px')
    }

    $.when($.get('/settings'), $.get('/chunks'), $.get('/recordings')).done(function(settings, chunks, recordings) {
        settings = settings[0];
        renderChunks(chunks[0]);
        renderRecordings(recordings[0]);

        setThreshold(settings.threshold);

        socket.on('chunk', function(chunk) {
            $track.append('<div class="chunk" data-time="' + chunk.time + '" style="height: ' + chunk.loudness * 10 + '%"></div>');
            $track.scrollLeft(($track.scrollLeft() + 1))
            setThreshold(chunk.threshold);
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
