import { BASE_LAYERS, ELEMENTS, STYLES, BOUNDARY_LAYER_PATHS, SYMBOL_LAYER_PATHS, COUNTY_DATASOURCE_PATHS, ICON_PATHS, ALLOWED_COUNTIES} from './constants.js';
import { addEventListener } from './eventListeners.js';

// Map and Layers
let map, marker, countyLayer, legislativeLayer, highlightedCountyLayer, tribalBoundariesLayer;
let precinctLayers = [], highlightedPollLocMarkers = [], pollingLocationMarkers = [], postOfficeIconMarkers = [];
let pollLocMarkerMap = {};

// Data
let precinctData, countyData, legislativeData, tribalBoundariesData;
const countyAuditorInfo = {};

// Other Variables
let cancelTokenSource = null;

// Search Control
const searchControl = new L.Control.Search({
    url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
    jsonpParam: 'json_callback',
    propertyName: 'display_name',
    propertyLoc: ['lat', 'lon'],
    marker: false,
    autoCollapse: true,
    autoType: false,
    minLength: 2,
    position: 'topright',
});

searchControl.on('search:locationfound', (e) => {
    placeMarker(e.latlng);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
});

function initMap(lat, long, zoom_level) {
    map = L.map('map').setView([lat, long], zoom_level);
    BASE_LAYERS["OpenStreetMap"].addTo(map);
    map.addControl(searchControl);
    appLayerAddRules();
}

function loadCountyAuditorInfo(path) {
    Papa.parse(path, {
        download: true,
        header: true,
        complete: (results) => {
            results.data.forEach((row) => {
                countyAuditorInfo[row.County] = row;
            });
            populateCountySelector(results.data);
        },
    });
}

function initLayer(path, layerInitFunction) {
    axios.get(path)
        .then(response => layerInitFunction(response.data))
        .catch(error => console.error(`Could not load layer from ${path}`, error));
}

function initPrecinctLayer(path) {
    initLayer(path, (data) => {
        precinctData = data;
        ELEMENTS.precinctCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                ELEMENTS.countyCheckbox.checked = true;
                ELEMENTS.countyCheckbox.disabled = true;
                showPrecinctsForCounty(ELEMENTS.countyDropdown.value);
                countyLayer.addTo(map);
            } else {
                ELEMENTS.countyCheckbox.disabled = false;
                clearAllPrecinctsOnMap();
            }
        });
    });
}

function initLegislativeLayer(path) {
    initLayer(path, (data) => {
        legislativeData = data;
        legislativeLayer = L.geoJson(legislativeData, { style: STYLES.LEGISLATIVE_LAYER });
        addEventListener.legislativeCheckBox(map, legislativeLayer);
    });
}

function initTribalLayer(path) {
    initLayer(path, (data) => {
        tribalBoundariesData = data;
        tribalBoundariesLayer = L.geoJson(data, {
            style: STYLES.TRIBAL_BOUNDARIES,
            onEachFeature: addTribalLandLabel,
        });
        addEventListener.tribalBoundariesCheckBox(map, tribalBoundariesLayer);
    });
}

function initPollingLocationLayer(path) {
    initLayer(path, populatePollingLocations);
}

function initPostOfficeLayer(path){
    initLayer(path, (data) => {
        ELEMENTS.postOfficesCheckBox.addEventListener('change', function(e) {
        e.target.checked ? populatePostOffices(data) : clearPostOffices()}
    )}
)}

function initCountyLayer(path) {
    initLayer(path, (data) => {
        countyData = data;
        addCountyLayerToMap(countyData);
        populateCountySelector(countyData.features);
        map.fitBounds(countyLayer.getBounds());
        addEventListener.countyCheckBox(map, countyLayer, highlightedCountyLayer);
    });
}

function addTribalLandLabel(feature, layer) {
    const center = layer.getBounds().getCenter();
    if (feature.properties?.NAME) {
        const label = L.divIcon({
            className: 'tribal-land-label',
            html: `<div style="color: #808080; font-size: 8px; text-align: center;">${feature.properties.NAME}</div>`,
            iconSize: [50, 20],
            iconAnchor: [10, 0],
        });
        layer.labelMarker = L.marker(center, { icon: label });
    }
}

function initCheckBoxStates() {
    ELEMENTS.precinctCheckbox.checked = true;
    ELEMENTS.countyCheckbox.checked = true;
    ELEMENTS.countyCheckbox.disabled = true;
}

function initCountySelector() {
    ELEMENTS.countyDropdown.addEventListener('change', (e) => {
        clearAllPrecinctsOnMap();
        const selectedCounty = e.target.value;
        if (!selectedCounty) {
            highlightedCountyLayer && map.removeLayer(highlightedCountyLayer);
            hideCountyAuditorInfoTable();
        }
        map.fitBounds(L.geoJson(getCountyFeatureByName(selectedCounty)).getBounds());
        highlightCounty(selectedCounty);
    });
}

function initBoundaryLayers(layers_to_include) {
    layers_to_include.County && initCountyLayer(BOUNDARY_LAYER_PATHS.COUNTY);
    layers_to_include.Legislative && initLegislativeLayer(BOUNDARY_LAYER_PATHS.LEGISLATIVE);
    layers_to_include.Precinct && initPrecinctLayer(BOUNDARY_LAYER_PATHS.PRECINCT);
    layers_to_include.Tribal && initTribalLayer(BOUNDARY_LAYER_PATHS.TRIBAL);
}

function initSymbolLayers() {
    initPollingLocationLayer(SYMBOL_LAYER_PATHS.POLLING_LOCATIONS);
    initPostOfficeLayer(SYMBOL_LAYER_PATHS.POST_OFFICES);
}

function initControls() {
    initCountySelector();
    initCheckBoxStates();
}

function initLegend() {
    createLayersLegend();
    createIconLegend();
}

function zoomToCoords(latlng, threshold) {
    map.setView(latlng, map.getZoom() < threshold ? threshold : map.getZoom());
}

function appLayerAddRules() {
    map.on('layeradd', () => {
        legislativeLayer?.bringToFront();
        tribalBoundariesLayer?.bringToFront();
    });
}

function clearHighlightedCounty() {
    highlightedCountyLayer && map.removeLayer(highlightedCountyLayer);
}

function highlightCounty(countyName) {
    clearHighlightedCounty();
    if (!ELEMENTS.countyCheckbox.checked) return;

    const selectedCountyFeature = getCountyFeatureByName(countyName);
    if (!selectedCountyFeature || !ALLOWED_COUNTIES.includes(countyName)) return;

    highlightedCountyLayer = L.geoJson(selectedCountyFeature, {
        style: STYLES.HIGHLIGHTED_COUNTY,
    }).addTo(map);
}

function populateCountySelector(data) {
    data.forEach(row => {
        const option = Object.assign(document.createElement('option'), { value: row.County, textContent: row.County });
        ELEMENTS.countyDropdown.appendChild(option);
    });
}

function clearCurrentMarker() {
    marker && map.removeLayer(marker);
}

function clearAllPrecinctsOnMap() {
    precinctLayers.forEach(layer => map.removeLayer(layer));
    precinctLayers = [];
    clearPrecinctsInLegend();
}

function placeMarker(latlng, precinct, district) {
    const popupContent = `
        ${precinct ? `<b>Precinct:</b> ${precinct}<br>` : `Precinct information unavailable for this county. Check the <a href="https://www.sos.nd.gov/" target="_blank">ND SoS website</a>.<br><br>`}
        <b>District:</b> ${district || "N/A"}<br><br>
        ${latlng.lat.toFixed(2)}, ${latlng.lng.toFixed(2)}
    `;

    marker = L.marker(latlng).addTo(map)
        .bindPopup(popupContent)
        .openPopup();
}

function getGeographicalFeature(lat, lng, data, propertyName) {
    const point = turf.point([lng, lat]);
    let result = null;

    turf.featureEach(data, currentFeature => {
        if (turf.booleanPointInPolygon(point, currentFeature)) {
            result = currentFeature.properties[propertyName];
        }
    });

    return result;
}

function getCountyFeatureByName(countyName) {
    return countyData.features.find(feature => feature.properties.NAME === countyName);
}

function generatePrecinctColorMap(county) {
    const colors = [
        '#e6194b', '#ffe119', '#4363d8', '#f58231', '#201923', '#6B3E3E', '#fcff5d',
        '#8ad8e8', '#235b54', '#29bdab', '#3998f5', '#37294f', '#277da7', '#3750db',
        '#f22020', '#991919', '#ffcba5', '#e68f66', '#632819', '#c56133', '#ffc413',
        '#b732cc', '#772b9d', '#f47a22', '#2f2aa0', '#f07cab', '#d30b94', '#edeff3',
        '#c3a5b4', '#946aa2', '#5d4c86', '#96341c'
    ];
    const precinctColorMap = {};
    let colorIndex = 0;

    precinctData.features.forEach(feature => {
        if (turf.booleanPointInPolygon(turf.centroid(feature), county)) {
            const precinctName = feature.properties.Name;
            if (!precinctColorMap[precinctName]) {
                precinctColorMap[precinctName] = colors[colorIndex % colors.length];
                colorIndex++;
            }
        }
    });

    return precinctColorMap;
}

function showPrecinctColorsOnMap(precinctColorMap, county) {
    precinctData.features.forEach(feature => {
        if (turf.booleanPointInPolygon(turf.centroid(feature), county)) {
            const precinctName = feature.properties.Name;
            const layer = L.geoJson(feature, {
                style: () => ({
                    color: precinctColorMap[precinctName],
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.3,
                    fillColor: precinctColorMap[precinctName],
                }),
            }).addTo(map);
            precinctLayers.push(layer);
        }
    });
}

function showPrecinctsForCounty(countyName) {
    clearAllPrecinctsOnMap();
    if (!ALLOWED_COUNTIES.includes(ELEMENTS.countyDropdown.value)) return;
    if (!ELEMENTS.precinctCheckbox.checked) return;

    const countyFeature = getCountyFeatureByName(countyName);
    if (!countyFeature) return;

    const precinctColorMap = generatePrecinctColorMap(countyFeature);
    showPrecinctColorsOnMap(precinctColorMap, countyFeature);
    updatePrecinctsInLegend(precinctColorMap);
}

function clearPrecinctsInLegend() {
    ELEMENTS.precinctsLegendDiv.innerHTML = ELEMENTS.precinctCheckbox.checked ? 
        'Precinct information currently unavailable for this county' : 
        'Enable precinct layer and select county to view precincts';
}

function updatePrecinctsInLegend(precinctColorMap) {
    ELEMENTS.precinctsLegendDiv.innerHTML = '';
    const sortedPrecinctNames = Object.keys(precinctColorMap).sort();

    sortedPrecinctNames.forEach(precinctName => {
        ELEMENTS.precinctsLegendDiv.innerHTML += `
            <div class="legend-item">
                <div class="legend-color" style="background: rgba(${hexToRgb(precinctColorMap[precinctName])}, 0.55);"></div>
                ${precinctName}
            </div>`;
    });
}

const hexToRgb = hex => parseInt(hex.replace('#', ''), 16).toString(16).match(/.{2}/g).map(n => parseInt(n, 16)).join(', ');

function reverseGeocode(lat, lng) {
    cancelTokenSource && cancelTokenSource.cancel();
    cancelTokenSource = axios.CancelToken.source();

    const reverseGeocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
    axios.get(reverseGeocodeUrl, { cancelTokenSource })
        .then(response => displayAddress(response.data))
        .catch(error => {
            if (!axios.isCancel(error)) {
                console.log("Error occurred during reverse geocoding.");
            }
        });
}

function displayAddress(address) {
    const components = [
        address.address.house_number,
        address.address.road,
        address.address.city || address.address.village || address.address.town,
        address.address.state,
        address.address.postcode,
    ];
    ELEMENTS.addressDisplay.innerHTML = components.filter(Boolean).length > 0 
        ? `<span style="color: #666; font-weight: 500;">Approximate address: </span><br>${components.filter(Boolean).join(', ')}` 
        : 'Address not found';
}

function setPlaceholderAddress() {
    ELEMENTS.addressDisplay.textContent = 'Fetching address...';
}

function displayCountyAuditorInfo(countyName) {
    const countyAuditor = countyAuditorInfo[countyName];
    if (!countyAuditor) return hideCountyAuditorInfoTable();

    showCountyAuditorInfoTable();
    ELEMENTS.countyAuditorInfoTable.rows[0].cells[1].textContent = countyAuditor.County;
    ELEMENTS.countyAuditorInfoTable.rows[1].cells[1].textContent = countyAuditor.Auditor;
    ELEMENTS.countyAuditorInfoTable.rows[2].cells[1].textContent = countyAuditor['Phone/Fax/Email'];
    ELEMENTS.countyAuditorInfoTable.rows[3].cells[1].textContent = countyAuditor.Address;
}

function showCountyAuditorInfoTable() {
    ELEMENTS.countyAuditorInfoTable.style.display = 'block';
}

function hideCountyAuditorInfoTable() {
    ELEMENTS.countyAuditorInfoTable.style.display = 'none';
}

function highlightPollingLocationForPrecinct(precinct) {
    clearHighlightedPollLocations();
    if (!pollLocMarkerMap[precinct]) return;

    pollLocMarkerMap[precinct].forEach(marker => {
        marker.setIcon(highlightedPolLocIcon);
        highlightedPollLocMarkers.push(marker);
    });
}

function clearHighlightedPollLocations() {
    highlightedPollLocMarkers.forEach(marker => {
        marker.setIcon(notHighlightedPolLocIcon);
    });
    highlightedPollLocMarkers = [];
}

function clearPostOffices()
{
    postOfficeIconMarkers.forEach(marker => {
        map.removeLayer(marker)
         }
    ) 
}


function addCountyLayerToMap(data) {
    countyLayer = L.geoJson(data, {
        style: feature => ({
            color: ALLOWED_COUNTIES.includes(feature.properties.NAME) ? "#ff7800" : "#000000",
            weight: ALLOWED_COUNTIES.includes(feature.properties.NAME) ? 2 : 0.5,
            opacity: ALLOWED_COUNTIES.includes(feature.properties.NAME) ? 1 : 0.5,
            fillOpacity: 0,
        }),
        onEachFeature: (feature, layer) => {
            layer.on('click', () => {
                ELEMENTS.countyDropdown.value = feature.properties.NAME;
                highlightCounty(feature.properties.NAME);
            });
        },
    }).addTo(map);
}

function populatePollingLocations(pollingLocations) {
    pollingLocations.forEach(pollingLoc => {
        const precinctsList = getPrecinctsList(pollingLoc.Precincts_list);
        const pollingLocation = addSymbolMarker(pollingLoc.latitude,pollingLoc.longitude, notHighlightedPolLocIcon);

        bindPopupToPollLocationMarker(pollingLocation, pollingLoc, precinctsList);
        updatePollLocMarkerMap(precinctsList, pollingLocation);
        addMarkerHoverEffect(pollingLocation);

        pollingLocationMarkers.push(pollingLocation);
    });
}

function populatePostOffices(postOffices) {

    const sourceProjection = 'EPSG:3857'; // Web Mercator
    const destProjection = 'EPSG:4326';   // WGS84 (Latitude/Longitude)

    postOffices.forEach(postOffice => {
        if (postOffice.x && postOffice.y) {
            const [lng, lat] = proj4(sourceProjection, destProjection, [postOffice.x, postOffice.y]);

            const postOfficeIconMarker = addSymbolMarker(lat, lng, postOfficeIcon);
            postOfficeIconMarkers.push(postOfficeIconMarker);
        } else {
            console.error("Invalid post office coordinates:", postOffice);
        }
    });
}

function getPrecinctsList(precincts) {
    return String(precincts).split(',').map(precinct => precinct.trim());
}

function addSymbolMarker(lat,long,icon) {
    return L.marker([lat, long], {
        icon: icon,
    }).addTo(map);
}

function bindPopupToPollLocationMarker(marker, pollingLoc, precinctsList) {
    marker.bindPopup(`
        <b>County:</b> ${pollingLoc.County}<br>
        <b>Polling Location:</b> ${pollingLoc.PollingLocation}<br>
        <b>Address:</b> ${pollingLoc.Address}<br>
        <b>City:</b> ${pollingLoc.City}<br>
        <b>Zip Code:</b> ${pollingLoc.ZipCode}<br>
        <b>Polling Hours:</b> ${pollingLoc.PollingHours}<br><br>
        <b>Precincts List:</b> ${precinctsList.join(',')}<br>
    `);
}

function updatePollLocMarkerMap(precinctsList, marker) {
    precinctsList.forEach(precinct => {
        (pollLocMarkerMap[precinct] = pollLocMarkerMap[precinct] || []).push(marker);
    });
}

function addMarkerHoverEffect(marker) {
    marker.on('mouseover', function() {
        this.openPopup();
    });
    marker.on('mouseout', function() {
        this.closePopup();
    });
}

function createDynamicPollingIcon(zoomLevel, iconUrl, scale, minSize) {
    const size = zoomLevel * scale + minSize; // Customize as needed

    return L.icon({
        iconUrl: iconUrl,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
        popupAnchor: [1, -size / 2],
    });
}

function createLayersLegend() {
    ELEMENTS.layersLegend.innerHTML = '';

    let legendContent = '<div class="info legend">';
    legendContent += '<i style="border: 3px dashed #000000; width: 30px; height: 0; display: inline-block; margin-right: 8px;"></i> Legislative <br>';
    legendContent += '<i style="border: 3px solid #a3be8c; width: 30px; height: 0; display: inline-block; margin-right: 8px;"></i> Tribal <br>';
    legendContent += '<i style="border: 2px solid #ff7800; width: 30px; height: 0; display: inline-block; margin-right: 8px;"></i> Counties with precinct info<br>';
    legendContent += '<i style="border: 1px solid #000000; width: 30px; height: 0; display: inline-block; margin-right: 8px;"></i> Other Counties<br>';
    legendContent += '</div>';

    ELEMENTS.layersLegend.innerHTML = legendContent;
}

function createIconLegend() {    
    ELEMENTS.iconLegend.innerHTML = '';

    const iconLegendContent = `
        <div class="info icon-legend">
            <img src="${ICON_PATHS.POLLING_LOCATION}" style="width: 25px; height: 25px; margin-right: 4px;"> Polling place<br>
            <img src="${ICON_PATHS.HIGHLIGHTED_POLLING_LOCATION}" style="width: 25px; height: 25px; margin-right: 4px;"> Polling place for selected precinct <br>
            <img src="${ICON_PATHS.POST_OFFICE}" style="width: 25px; height: 25px; margin-right: 4px;"> Post office <br>
        </div>`;

    ELEMENTS.iconLegend.innerHTML = iconLegendContent;
}

// Initialization
initMap(46.8772, -96.7898, 7);
initBoundaryLayers({
    County: true,
    Tribal: true,
    Legislative: true,
    Precinct: true,
});
initSymbolLayers();
initControls();
initLegend();

loadCountyAuditorInfo(COUNTY_DATASOURCE_PATHS.COUNTY_AUDITOR);
hideCountyAuditorInfoTable(); // Hide at the start

let notHighlightedPolLocIcon = createDynamicPollingIcon(map.getZoom(), ICON_PATHS.POLLING_LOCATION, 2, 10);
let highlightedPolLocIcon = createDynamicPollingIcon(map.getZoom(), ICON_PATHS.HIGHLIGHTED_POLLING_LOCATION, 2, 10);
let postOfficeIcon = createDynamicPollingIcon(map.getZoom(),  ICON_PATHS.POST_OFFICE, 1, 5);

map.on('click', (e) => {
    clearAllPrecinctsOnMap();
    clearHighlightedPollLocations();
    clearHighlightedCounty();
    setPlaceholderAddress(); 
    clearCurrentMarker();

    const county = getGeographicalFeature(e.latlng.lat, e.latlng.lng, countyData, 'NAME');
    const precinct = getGeographicalFeature(e.latlng.lat, e.latlng.lng, precinctData, 'Name');
    const district = getGeographicalFeature(e.latlng.lat, e.latlng.lng, legislativeData, 'DISTRICT');

    zoomToCoords(e.latlng, 8);
    ELEMENTS.countyDropdown.value = county || "";

    county ? (
        displayCountyAuditorInfo(county),
        placeMarker(e.latlng, precinct, district),
        showPrecinctsForCounty(county)
    ) : hideCountyAuditorInfoTable();
    
    ALLOWED_COUNTIES.includes(county) && highlightCounty(county);
    highlightPollingLocationForPrecinct(precinct);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
});

map.on('zoomend', () => {
    notHighlightedPolLocIcon = createDynamicPollingIcon(map.getZoom(), ICON_PATHS.POLLING_LOCATION, 2, 10);
    highlightedPolLocIcon = createDynamicPollingIcon(map.getZoom(), ICON_PATHS.HIGHLIGHTED_POLLING_LOCATION, 2, 10);
    postOfficeIcon = createDynamicPollingIcon(map.getZoom(), ICON_PATHS.POST_OFFICE, 1, 5);

    pollingLocationMarkers.forEach(marker => {
        marker.setIcon(notHighlightedPolLocIcon);
    });

    highlightedPollLocMarkers.forEach(marker => {
        marker.setIcon(highlightedPolLocIcon);
    });

    postOfficeIconMarkers.forEach(marker => {
        marker.setIcon(postOfficeIcon);
    });
});
