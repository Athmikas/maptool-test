export const addEventListener = {
    legislativeCheckBox: function (map, legislativeLayer) {
        document.getElementById('toggle-legislative').addEventListener('change', (e) => {
            e.target.checked ? legislativeLayer.addTo(map) : map.removeLayer(legislativeLayer);
        });
    },

    tribalBoundariesCheckBox: function(map, tribalBoundariesLayer) {
        document.getElementById('toggle-tribal-boundaries').addEventListener('change', function(e) {
            tribalBoundariesLayer[e.target.checked ? 'addTo' : 'removeFrom'](map);
            tribalBoundariesLayer.eachLayer(layer => {
                if (layer.labelMarker) {
                    layer.labelMarker[e.target.checked ? 'addTo' : 'removeFrom'](map);
                }
            });
        });
    },

    countyCheckBox: function (map, countyLayer, highlightedCountyLayer) {
        document.getElementById('toggle-county').addEventListener('change', function(e) {
            if (e.target.checked || e.target.disabled) {
                countyLayer.addTo(map);
            } else {
                if (!document.getElementById('toggle-precinct').checked) {
                    map.removeLayer(countyLayer);
                }
                if (highlightedCountyLayer) {
                    map.removeLayer(highlightedCountyLayer);
                }
            }
        });
    }
}
