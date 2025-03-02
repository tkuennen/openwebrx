//
// Map Manager handles web socket connection and traffic processing
//

function MapManager() {
    var self = this;

    // Determine web socket URL
    var protocol = window.location.protocol.match(/https/) ? 'wss' : 'ws';
    var href = window.location.href.replace(/\/[^\/]*$/,'');
    href = protocol + '://' + href.split('://')[1];
    this.ws_url = href + (href.endsWith('/')? '':'/') + 'ws/';

    // Reset everything for now
    this.reconnect_timeout = false;
    this.config = {};

    // Markers management (features, APRS, AIS, HFDL, etc)
    this.mman = new MarkerManager();

    // Locators management (FT8, FT4, WSPR, etc)
    this.lman = new LocatorManager();

    // Fade out / remove positions after time
    setInterval(function() {
        self.lman.ageAll();
        self.mman.ageAll();
    }, 15000);

    // When stuff loads...
    $(function() {
        // Create clock display
        self.clock = new Clock($('#openwebrx-clock-utc'));

        // Clicking clock display toggles legend box on/off
        $('#openwebrx-clock-utc').css('cursor', 'pointer').on('click', function() {
            var el = document.getElementById('openwebrx-map-selectors');
            if (el) {
                el.style.display = el.style.display === 'none'?
                    'block' : 'none';
            }
        });

        // Toggle color modes on click
        $('#openwebrx-map-colormode').on('change', function() {
            self.lman.setColorMode($(this).val());
        });
    });

    // Connect web socket
    this.connect();
}

//
// Process a message received over web socket
//
MapManager.prototype.process = function(e) {
    if (typeof e.data != 'string') {
        console.error("unsupported binary data on websocket; ignoring");
        return
    }

    if (e.data.substr(0, 16) == "CLIENT DE SERVER") {
        return
    }

    try {
        var json = JSON.parse(e.data);
        switch (json.type) {
            case "update":
                this.processUpdates(json.value);
                break;

            case 'receiver_details':
                $().ready(function () { // make sure header is loaded
                    $('.webrx-top-container').header().setDetails(json.value);
                });
                break;

            case "config":
                Object.assign(this.config, json.value);
                if ('receiver_gps' in this.config) {
                    // Passing API key even if this particular map
                    // engine does not need it (Google Maps do)
                    this.initializeMap(
                        this.config.receiver_gps,
                        this.config.google_maps_api_key,
                        this.config.openweathermap_api_key
                    );
                }
                if ('receiver_name' in this.config) {
                    this.setReceiverName(this.config.receiver_name);
                }
                if ('map_position_retention_time' in this.config) {
                    retention_time = this.config.map_position_retention_time * 1000;
                }
                if ('callsign_url' in this.config) {
                    callsign_url = this.config.callsign_url;
                }
                if ('vessel_url' in this.config) {
                    vessel_url = this.config.vessel_url;
                }
                if ('flight_url' in this.config) {
                    flight_url = this.config.flight_url;
                }
                if ('modes_url' in this.config) {
                    modes_url = this.config.modes_url;
                }
                break;

            default:
                console.warn('received message of unknown type: ' + json.type);
        }
    } catch (e) {
        // Don't lose exception
        console.error(e);
    }
};

//
// Connect web socket
//
MapManager.prototype.connect = function() {
    var ws = new WebSocket(this.ws_url);
    var self = this;

    // When socket opens...
    ws.onopen = function() {
        ws.send("SERVER DE CLIENT client=map.js type=map");
        self.reconnect_timeout = false
    };

    // When socket closes...
    ws.onclose = function() {
        // Clear map
        self.removeReceiver();
        self.mman.clear();
        self.lman.clear();

        if (self.reconnect_timeout) {
            // Max value: roundabout 8 and a half minutes
            self.reconnect_timeout = Math.min(self.reconnect_timeout * 2, 512000);
        } else {
            // Initial value: 1s
            self.reconnect_timeout = 1000;
        }

        // Try reconnecting after timeout
        setTimeout(function() { self.connect(); }, self.reconnect_timeout);
    };

    // When socket receives a message...
    ws.onmessage = function(e) {
        self.process(e);
    }

    // When socket gets an error...
    //ws.onerror = function() {
    //    console.info("websocket error");
    //};

    // http://stackoverflow.com/questions/4812686/closing-websocket-correctly-html5-javascript
    window.onbeforeunload = function() {
        ws.onclose = function () {};
        ws.close();
    };
};

//
// Set up legend filter toggles inside given HTML element.
//
MapManager.prototype.setupLegendFilters = function($legend) {
    var self = this;

    $content = $legend.find('.content');
    $content.on('click', 'li', function() {
        var $el = $(this);
        $lis = $content.find('li');
        if ($lis.hasClass('disabled') && !$el.hasClass('disabled')) {
            $lis.removeClass('disabled');
            self.lman.setFilter();
        } else {
            $el.removeClass('disabled');
            $lis.filter(function() {
                return this != $el[0]
            }).addClass('disabled');
            self.lman.setFilter($el.data('selector'));
        }
    });

    $content1 = $legend.find('.features');
    $content1.on('click', 'li', function() {
        var $el = $(this);
        var onoff = $el.hasClass('disabled');
        if (onoff) {
            $el.removeClass('disabled');
        } else {
            $el.addClass('disabled');
        }
        self.mman.toggle(map, $el.data('selector'), onoff);
    });
};
