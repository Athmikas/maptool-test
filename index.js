import { addEventListener } from './eventListeners.js';

// DOM Elements
var addressDisplay = document.getElementById('address-display');
var countyAuditorInfoTable = document.getElementById('county-info-table');
var overlay = document.getElementById('overlay');

// Map and Layers
var map;
var marker;
var countyLayer;
var legislativeLayer;
var highlightedCountyLayer;
var precinctLayers = [];
var highlightedPollLocs = [];
var pollingLocationMarkers = [];

// Data
var precinctData;
var countyData;
var legislativeData;
var countyAuditorInfo = {};

// Other Variables
var cancelTokenSource = null;
var pollLocMarkerMap = {};
var legend = L.control({ position: 'bottomright' });

//Icons
var notHighlightedPolLocIcon = L.icon({
    iconUrl: 'images/voting-pin_notselected.png',
    iconSize: [25, 30],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

var highlightedPolLocIcon = L.icon({
    iconUrl: 'images/voting-pin_selected.png',
    iconSize: [25, 30],
    iconAnchor: [12, 35],
    popupAnchor: [1, -34],
});

//Base Layers
var baseLayers = {
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 20,
    })
};

// Search Control
var searchControl = new L.Control.Search({
    url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
    jsonpParam: 'json_callback',
    propertyName: 'display_name',
    propertyLoc: ['lat', 'lon'],
    marker: false,
    autoCollapse: true,
    autoType: false,
    minLength: 2,
    position: 'topright'
});

searchControl.on('search:locationfound', function (e) {
    placeMarker(e.latlng);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
});

function appLayerAddRules()
{
    map.on('layeradd', function(e) {
        if (countyLayer) {
            countyLayer.bringToFront();
        }
        if (legislativeLayer) {
            legislativeLayer.bringToFront();
        }
     });
}

function removeHighlightedCountyLayer()
{
    if (highlightedCountyLayer) {
        map.removeLayer(highlightedCountyLayer);
    }
}

function highlightCounty(countyName) {
    removeHighlightedCountyLayer();

    var selectedFeature = countyData.features.find(function (feature) {
        return feature.properties.NAME === countyName;
    });
    if (selectedFeature) {
        highlightedCountyLayer = L.geoJson(selectedFeature, {
            style: function () {
                return {
                    color: "#ff0000",
                    weight: 5,
                    opacity: 1,
                    fillOpacity: 0.05,
                    fillColor: '#ff0000'
                };
            }
        }).addTo(map);

        showPrecinctsForCounty(countyName);
    }
}

function initMap()
{
    map = L.map('map').setView([46.8772, -96.7898], 7); // Centered in Fargo, North Dakota with initial zoom level 7
    baseLayers["OpenStreetMap"].addTo(map);
    L.control.layers(baseLayers).addTo(map);

    map.addControl(searchControl);
    appLayerAddRules();

    initLayers();
}

function loadCountyAuditorInfo() {
    Papa.parse('data/County_Information.csv', {
        download: true,
        header: true,
        complete: function (results) {
            results.data.forEach(function (row) {
                countyAuditorInfo[row.County] = row;
            });
            populateCountySelector(results.data);
        }
    });
}

function loadPrecinctData() {
    axios.get('data/map.geojson')
        .then(function (response) {
            precinctData = response.data;

            // Show precincts by default
            document.getElementById('toggle-legend').checked = true;
            showPrecinctsForCounty(document.getElementById('county-select').value);
            addEventListener.precinctCheckbox();
        })
        .catch(function (error) {
            console.error("Could not load the GeoJSON file.", error);
        });
}

function loadLegislativeData() {
    // Fetch and add Legislative Boundaries GeoJSON layer from API
     axios.get('https://services1.arcgis.com/GOcSXpzwBHyk2nog/arcgis/rest/services/NDGISHUB_Legislative_Districts/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson')
         .then(function(response) {
             legislativeData = response.data;
             legislativeLayer = L.geoJson(legislativeData, {
                 style: function() {
                     return {
                         color: "#000000",
                         weight: 3,
                         opacity: 1,
                         dashArray: '4, 10',
                         fillOpacity: 0
                     };
                 }
             });
             addEventListener.legislativeCheckBox(map,legislativeLayer);
         })
         .catch(function(error) {
             console.error("Could not load the Legislative Boundaries GeoJSON file from API.", error);
         });
}

function loadCountyData() {
    axios.get('https://services1.arcgis.com/GOcSXpzwBHyk2nog/arcgis/rest/services/NDGISHUB_County_Boundaries/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson')
        .then(function(response) {
            countyData = response.data;
            addCountyLayer();
            populateCountySelector(countyData.features);
            var bounds = countyLayer.getBounds();
            map.fitBounds(bounds);
            addEventListener.countyCheckBox(map,countyLayer,highlightedCountyLayer);

        })
        .catch(function(error) {
            console.error("Could not load the County GeoJSON file from API.", error);
        });
}

function populateCountySelector(data) {
    var select = document.getElementById('county-select');
    data.forEach(function (row) {
        var option = document.createElement('option');
        option.value = row.County;
        option.textContent = row.County;
        select.appendChild(option);
    });
}

function initCheckBoxes()
{
    // Ensure the initial state of "County Boundaries" checkbox
    document.getElementById('toggle-county').checked = true;
    document.getElementById('toggle-county').disabled = true;

}

function initCountySelector()
{
    document.getElementById('county-select').addEventListener('change', function(e) {
        var selectedCounty = e.target.value;
        if (selectedCounty) { 
            var selectedFeature = countyData.features.find(function(feature) {
                return feature.properties.NAME === selectedCounty;
            });
            var countyBounds = L.geoJson(selectedFeature).getBounds();
            map.fitBounds(countyBounds);
            highlightCounty(selectedCounty);
        } else {
            // Zoom out to the center of the county GeoJSON
            map.fitBounds(bounds);
            if (highlightedCountyLayer) {
                map.removeLayer(highlightedCountyLayer);
            }
            precinctLayers.forEach(function(layer) {
                map.removeLayer(layer);
            });
            precinctLayers = [];
            document.getElementById('legend-items').innerHTML = '';
        }
    });
}

function initLayers()
{
    loadCountyData();
    loadLegislativeData();
    loadPrecinctData();

}

initMap();

loadCountyAuditorInfo();
loadPollingLocationsData();

initCountySelector();
initCheckBoxes();


function zoomToCoords(latlng) {
    if (map.getZoom() < 10) { // Only zoom in if the current zoom level is less than 10
        map.setView(latlng, 10);
    } else {
        map.setView(latlng);
    }
}

map.on('click', function (e) {
    if (!navigator.onLine) {
        displayMessageInOverlay("You're Offline. Cannot Fetch Your Address.");
        return;
    }

    overlay.style.display = 'none';
    placeMarker(e.latlng);
    if (cancelTokenSource) {
        cancelTokenSource.cancel();
    }

    displayMessageInOverlay("Fetching Address...");
    cancelTokenSource = axios.CancelToken.source();
    reverseGeocode(e.latlng.lat, e.latlng.lng, cancelTokenSource.token);
});

function clearPrecinctLayer()
{
    if (precinctLayers.length > 0) {
        precinctLayers.forEach(function (layer) {
            map.removeLayer(layer);
        });
        precinctLayers = [];
    }
}

function placeMarker(latlng) {
    zoomToCoords(latlng);

    if (marker) {
        map.removeLayer(marker);
    }

    clearPrecinctLayer();
    removeHighlightedCountyLayer();
    setPlaceholderAddress(); 

    var lat = latlng.lat.toFixed(2);
    var lng = latlng.lng.toFixed(2);
    var precinct = getGeographicalFeature(lat, lng, precinctData, 'Name');
    var county = getGeographicalFeature(lat, lng, countyData, 'NAME');
    var district = getGeographicalFeature(lat, lng, legislativeData, 'DISTRICT');

    marker = L.marker(latlng).addTo(map)
        .bindPopup("<b>Precinct:</b> " + (precinct ? precinct : "N/A") + "<br>" + 
                   "<b>District:</b> " + (district ? district : "N/A") + "<br><br>" +
                   "" + lat + "," + lng)
        .openPopup();

    populateCountyWithPrecinct(county,precinct);
}

function populateCountyWithPrecinct(county,precinct){
    if (county) {
        document.getElementById('county-select').value = county;
        if (document.getElementById('toggle-county').checked) {
                highlightCounty(county);
        }
        displayCountyInfo(county);
        highlightMarkersForPrecinctInCounty(precinct, county);

    } else {
        document.getElementById('county-select').value = "";
        clearCountyInfo();
    }
}

function getGeographicalFeature(lat, lng, data, propertyName) {
    var point = turf.point([lng, lat]);
    var result = null;

    turf.featureEach(data, function (currentFeature) {
        if (turf.booleanPointInPolygon(point, currentFeature)) {
            result = currentFeature.properties[propertyName];
        }
    });

    return result;
}

function showPrecinctsForCounty(countyName) {

    if (!document.getElementById('toggle-legend').checked) return;

    clearPrecinctLayer();

    var colors = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#201923', '#6B3E3E', '#fcff5d', '#7dfc00', '#0ec434', '#228c68', '#8ad8e8', '#235b54', '#29bdab', '#3998f5', '#37294f', '#277da7', '#3750db', '#f22020', '#991919', '#ffcba5', '#e68f66', '#632819',  '#c56133','#ffc413', '#b732cc', '#772b9d', '#f47a22', '#2f2aa0', '#f07cab', '#d30b94', '#edeff3', '#c3a5b4', '#946aa2', '#5d4c86','#96341c']
    var precinctColorMap = {};
    var colorIndex = 0;

    var county = countyData.features.find(function (feature) {
        return feature.properties.NAME === countyName;
    });

    if (!county) return;

    precinctData.features.forEach(function (feature) {
        if (turf.booleanPointInPolygon(turf.centroid(feature), county)) {
            var precinctName = feature.properties.Name;
            if (!precinctColorMap[precinctName]) {
                precinctColorMap[precinctName] = colors[colorIndex % colors.length];
                colorIndex++;
            }

            var layer = L.geoJson(feature, {
                style: function () {
                    return {
                        color: precinctColorMap[precinctName],
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.43,
                        fillColor: precinctColorMap[precinctName]
                    };
                }
            }).addTo(map);
            precinctLayers.push(layer);
        }
    });

    updateLegend(precinctColorMap);
}

function updateLegend(precinctColorMap) {
    var legendItemsDiv = document.getElementById('legend-items');
    legendItemsDiv.innerHTML = ''; 
    for (var precinctName in precinctColorMap) {
        legendItemsDiv.innerHTML += '<div class="legend-item"><div class="legend-color" style="background:' + precinctColorMap[precinctName] + '"></div>' + precinctName + '</div>';
    }
}

function reverseGeocode(lat, lng, cancelToken) {
    var url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;

    axios.get(url, { cancelToken })
        .then(function (response) {
            var address = response.data;
            displayAddress(address);
            displayMessageInOverlay("Click on Map to Estimate Precinct and Address Info");
        })
        .catch(function (error) {
            if (!axios.isCancel(error)) {
                displayMessageInOverlay("Error occurred during reverse geocoding.");
            }
        });
}

function displayAddress(address) {
    var components = [
        address.address.house_number,
        address.address.road,
        address.address.city || address.address.village || address.address.town,
        address.address.state,
        address.address.postcode
    ];
    addressDisplay.innerHTML = components.filter(Boolean).length > 0 
    ? '<span style="color: #666; font-weight: 500;">Address Estimate:</span><br>' + components.filter(Boolean).join(', ') 
    : 'Address not found';
}

function setPlaceholderAddress() {
    addressDisplay.textContent = 'Fetching address...';
}

function displayMessageInOverlay(message) {
    overlay.textContent = message;
    overlay.style.display = 'flex';
}

function displayCountyInfo(countyName) {
    var info = countyAuditorInfo[countyName];
    if (info) {
        countyAuditorInfoTable.rows[0].cells[1].textContent = info.Auditor;
        countyAuditorInfoTable.rows[1].cells[1].textContent = info['Phone/Fax/Email'];
        countyAuditorInfoTable.rows[2].cells[1].textContent = info.Address;
    } else {
        clearCountyInfo();
    }
}

function clearCountyInfo() {
    for (var i = 0; i < countyAuditorInfoTable.rows.length; i++) {
        countyAuditorInfoTable.rows[i].cells[1].textContent = '';
    }
}

function highlightMarkersForPrecinctInCounty(precinct, county) {
    clearHighlightedPollLocMarkers();
    if (pollLocMarkerMap[precinct]) {
        pollLocMarkerMap[precinct].forEach(function (marker) {
                marker.setIcon(highlightedPolLocIcon);
                highlightedPollLocs.push(marker);
        });
    }
}

function clearHighlightedPollLocMarkers() {
    highlightedPollLocs.forEach(function (marker) {
        marker.setIcon(notHighlightedPolLocIcon);
    });
    highlightedPollLocs = [];
}


function addCountyLayer()
{
    countyLayer = L.geoJson(countyData, {
        style: function() {
            return {
                color: "#ff7800",
                weight: 2,
                opacity: 1,
                fillOpacity: 0
            };
        },
        onEachFeature: function(feature, layer) {
            layer.on('click', function(e) {
                var countyName = feature.properties.NAME;
                document.getElementById('county-select').value = countyName;
                highlightCounty(countyName);
            });
        }
    }).addTo(map);
}


// Ensure "County Boundaries" checkbox is checked and cannot be unchecked if "Show Precincts" is checked
document.getElementById('toggle-legend').addEventListener('change', function(e) {
    var countyCheckbox = document.getElementById('toggle-county');
    if (e.target.checked) {
        countyCheckbox.checked = true;
        countyCheckbox.disabled = true;
    } else {
        countyCheckbox.disabled = false;
    }
});


function populatePollingLocations(geocodedPollingLocs)
{
    geocodedPollingLocs.forEach(function(pollingLoc) {
        var precinctsList = String(pollingLoc.Precincts_list).split(',').map(function(precinct) {
            return precinct.trim();
        });

        var marker = L.marker([pollingLoc.latitude, pollingLoc.longitude], { icon: notHighlightedPolLocIcon, county: pollingLoc.County }).addTo(map);
        marker.bindPopup(
            `<b>County:</b> ${pollingLoc.County}<br>` +
            `<b>Polling Location:</b> ${pollingLoc['PollingLocation']}<br>` +
            `<b>Address:</b> ${pollingLoc.Address}<br>` +
            `<b>City:</b> ${pollingLoc.City}<br>` +
            `<b>Zip Code:</b> ${pollingLoc['ZipCode']}<br>` +
            `<b>Polling Hours:</b> ${pollingLoc['PollingHours']}<br>` +
            `<b>Precincts List:</b> ${pollingLoc.Precincts_list}<br>`
        );

        precinctsList.forEach(function(precinct) {
            if (!pollLocMarkerMap[precinct]) {
                pollLocMarkerMap[precinct] = [];
            }
            pollLocMarkerMap[precinct].push(marker);
        });

        marker.on('mouseover', function (e) {
            this.openPopup();
        });

        marker.on('mouseout', function (e) {
            this.closePopup();
        });

        // Store marker for toggling visibility
        pollingLocationMarkers.push(marker);
    });
}

function loadPollingLocationsData()
{
    axios.get('data/geocoded_polling_locations_with_precincts.json')
    .then(function(response) {
        populatePollingLocations(response.data)
    })
    .catch(function(error) {
        console.error("Could not load the geocoded precincts JSON file.", error);
    });
}
