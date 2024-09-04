export const addEventListener = {
    legislativeCheckBox: function (map,legislativeLayer){
        document.getElementById('toggle-legislative').addEventListener('change', function(e) {
            if (e.target.checked) {
                legislativeLayer.addTo(map);
            } else {
                map.removeLayer(legislativeLayer);
            }
        });
    },

    precinctCheckbox: function (){
        document.getElementById('toggle-legend').addEventListener('change', function (e) {
            if (e.target.checked) {
                document.getElementById('legend').style.display = 'block';
                document.getElementById('toggle-county').checked = true;
                var selectedCounty = document.getElementById('county-select').value;
                if (selectedCounty) {
                    showPrecinctsForCounty(selectedCounty);
                }
                countyLayer.addTo(map);
            } else {
                precinctLayers.forEach(function (layer) {
                    map.removeLayer(layer);
                });
                precinctLayers = [];
                document.getElementById('legend').style.display = 'none';
            }
        });
    },

    countyCheckBox: function (map,countyLayer,highlightedCountyLayer) {
        document.getElementById('toggle-county').addEventListener('change', function(e) {
            if (e.target.checked || e.target.disabled) {
                countyLayer.addTo(map);
            } else {
                if (!document.getElementById('toggle-legend').checked) {
                    map.removeLayer(countyLayer);
                }
                if (highlightedCountyLayer) {
                    map.removeLayer(highlightedCountyLayer);
                }
            }
        });
    }
}
