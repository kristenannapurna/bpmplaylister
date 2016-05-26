'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var bpmApp = {};

//gets oAuth token from URL to make requests
bpmApp.getHashParams = function () {
    var hashParams = {};
    var e,
        r = /([^&;=]+)=?([^&;]*)/g,
        q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
        hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
};

bpmApp.params = bpmApp.getHashParams();
bpmApp.access_token = bpmApp.params.access_token;
bpmApp.refresh_token = bpmApp.params.refresh_token;
bpmApp.error = bpmApp.params.error;

bpmApp.bpmValues = {
    slow: { min: 60, max: 120 },
    fastest: { min: 160, max: 500 },
    fast: { min: 140, max: 160 },
    medium: { min: 125, max: 140 },
    slower: { min: 105, max: 125 }
};

bpmApp.init = function () {
    bpmApp.authenticate();
    bpmApp.gatherInfo();
};

bpmApp.authenticate = function () {
    if (bpmApp.error) {
        alert('There was an error during the authentication');
    } else {
        if (bpmApp.access_token) {
            // render oauth info
            $('#access').text(bpmApp.access_token);
            $('#refresh').text(bpmApp.refresh_token);

            $.ajax({
                url: 'https://api.spotify.com/v1/me',
                headers: {
                    'Authorization': 'Bearer ' + bpmApp.access_token
                },
                success: function success(response) {
                    $('#user-profile a').text(response.display_name).attr('href', response.href);
                    $('#login').hide();
                    $('#loggedin').show();
                }
            });
        } else {
            // render initial screen
            $('#login').show();
            $('#loggedin').hide();
        }

        document.getElementById('obtain-new-token').addEventListener('click', function () {
            $.ajax({
                url: '/refresh_token',
                data: {
                    'refresh_token': bpmApp.refresh_token
                }
            }).done(function (data) {
                bpmApp.access_token = data.access_token;
            });
        }, false);
    }
};

bpmApp.gatherInfo = function () {
    //spotify measures song length in milliseconds so we convert workout length to the same value
    var getMilliseconds = function getMilliseconds(min) {
        return min * 60000;
    };

    $('form').on('submit', function (e) {
        e.preventDefault();
        var warmupLength = $('#warmup').val();
        var workoutLength = $('#workout').val();
        var cooldownLength = $('#cooldown').val();
        var workoutType = $('option:selected').val();
        var genres = $('input[type=checkbox]:checked').map(function (el, item) {
            return $(this).attr('id');
        }).get();

        //add all of the info needed to an object in the main obj
        bpmApp.data = {
            warmup: getMilliseconds(warmupLength),
            workout: getMilliseconds(workoutLength),
            cooldown: getMilliseconds(cooldownLength),
            workoutType: workoutType,
            genres: genres
        };

        bpmApp.getArtists(bpmApp.data.genres);
    });
};

bpmApp.getArtists = function (genresArray) {
    var _$;

    var artistsByGenre = genresArray.map(function (genre) {
        return $.ajax({
            url: 'https://api.spotify.com/v1/search?',
            method: 'GET',
            dataType: 'json',
            headers: {
                'Authorization': 'Bearer ' + bpmApp.access_token
            },
            data: {
                type: "artist",
                q: "genre:" + genre,
                limit: 50
            }
        });
    });
    (_$ = $).when.apply(_$, _toConsumableArray(artistsByGenre)).then(function () {
        // convert multiple responses into array
        var artists = Array.prototype.slice.call(arguments);
        // if there were more than one ajax request the first element in the response will be an array.
        var isArray = $.isArray(artists[0]);

        if (isArray) {
            artists = artists.map(function (artist) {
                return artist[0].artists.items;
            });
            //flatten the array of arrays
            artists = bpmApp.flatten(artists);
        } else {
            artists = artists[0].artists.items;
        }

        bpmApp.getTracks(artists);
    });
};

bpmApp.getTracks = function (artistsArray) {
    var _$2;

    var potentialTracks = artistsArray.map(function (artist) {
        return $.ajax({
            url: 'https://api.spotify.com/v1/artists/' + artist.id + '/top-tracks',
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + bpmApp.access_token
            },
            data: {
                country: 'CA'
            }
        });
    });
    (_$2 = $).when.apply(_$2, _toConsumableArray(potentialTracks)).then(function () {
        // convert multiple responses into array, map the object to isolate tracks only
        var tracks = Array.prototype.slice.call(arguments).map(function (track) {
            return track[0].tracks;
        });
        //turn it into one array and get just the song IDs
        tracks = bpmApp.flatten(tracks).map(function (track) {
            return track.id;
        });
        //the next endpoint requires a max of 100 comma separated ids, so first we need to sort the results into groups of 100
        var groupsOf100 = [];
        while (tracks.length) {
            var hundred = tracks.splice(0, 100);
            groupsOf100.push(hundred);
        }
        bpmApp.getTempo(groupsOf100);
    });
};

bpmApp.getTempo = function (trackArrays) {
    var _$3;

    var songInfo = trackArrays.map(function (tracks) {
        var list = tracks.toString();
        return $.ajax({
            url: 'https://api.spotify.com/v1/audio-features',
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + bpmApp.access_token
            },
            data: {
                ids: list
            }

        });
    });
    (_$3 = $).when.apply(_$3, _toConsumableArray(songInfo)).then(function () {
        // convert multiple responses into array
        var songDetails = Array.prototype.slice.call(arguments).map(function (array) {
            return array[0].audio_features;
        });
        //finally, flatten this array into something we can filter through for the playlist
        songDetails = bpmApp.flatten(songDetails);
        bpmApp.sortByTempo(songDetails);
    });
};

bpmApp.sortByTempo = function (songDetailsList) {
    //shuffle array so that artists are mixed up
    songs = bpmApp.shuffle(songDetailsList);
    //get min and max BPM values from user data
    var warmAndCoolBPM = bpmApp.bpmValues.slow;
    var workoutBPM = bpmApp.bpmValues[bpmApp.data.workoutType];
    // filter songs for matching bpm values
    var warmupSongs = songs.filter(function (song) {
        return song.tempo >= warmAndCoolBPM.min && song.tempo <= warmAndCoolBPM.max;
    });

    var workOutSongs = songs.filter(function (song) {
        return song.tempo >= workoutBPM.min && song.tempo <= workoutBPM.max;
    });
    bpmApp.makePlaylist(warmupSongs, workOutSongs);
};

bpmApp.makePlaylist = function (warmup, workout) {
    var warmupLength = bpmApp.data.warmup;
    var workoutLength = bpmApp.data.workout;
    var cooldownLength = bpmApp.data.cooldown;

    //remove songs from large array and add them to the playlist array for the length of time needed. we might need to run this a few times in order to make the playlist close enough to the time we need so it's in a function.
    function getSongs(initialArray, timeCount) {
        var newArray = [];
        var remainingMilliseconds = timeCount;
        for (var i = 0; i <= initialArray.length; i++) {
            // add a song if there are more than 2 minutes more music needed
            if (remainingMilliseconds > 60000) {
                //add song to new array
                newArray.push(initialArray[i]);
                // update count based on length of song just added
                remainingMilliseconds -= initialArray[i].duration_ms;
            }
        }
        return newArray;
    }
    var warmupPlaylist = getSongs(warmup, warmupLength);
    var workoutPlaylist = getSongs(workout, workoutLength);
    //since cooldown is using the same bpm as warmup, shuffle array so there is less chance of repetition (or even better get the reduced array from the )
    var coolDown = bpmApp.shuffle(warmup);
    var coolDownPlaylist = getSongs(coolDown, cooldownLength);
    var fullPlaylist = warmupPlaylist.concat(workoutPlaylist, coolDownPlaylist);
    bpmApp.makePlayer(fullPlaylist);
};

bpmApp.makePlayer = function (playlist) {
    //get total playlist length
    var playlistLength = playlist.reduce(function (a, b) {
        return a += b.duration_ms;
    }, 0);

    //convert to minutes and seconds
    function millisToMinutesAndSeconds(millis) {
        var minutes = Math.floor(millis / 60000);
        var seconds = (millis % 60000 / 1000).toFixed(0);
        return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
    }

    playlistLength = millisToMinutesAndSeconds(playlistLength);
    // map this array to get IDS only and convert to comma separated list for the url
    var songIds = playlist.map(function (song) {
        return song.id;
    });
    var songIdList = songIds.toString();

    // build up URL and update src of embedded player
    var iframeUrl = 'https://embed.spotify.com/?uri=spotify:trackset:My%20Workout%20Playlist:' + songIdList + '&theme=white';

    // grab iframe on page and put our playlist inside!
    $('iframe').attr('src', iframeUrl);
    $('.playlistLength').text(playlistLength);
};

///utility functions live here

bpmApp.flatten = function (array) {
    return array.reduce(function (a, b) {
        return a.concat(b);
    }, []);
};

bpmApp.shuffle = function (array) {
    var currentIndex = array.length,
        temporaryValue,
        randomIndex;
    while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
};

$(function () {
    bpmApp.init();
});