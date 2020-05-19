//The maximum zoom level to cluster data point data on the map.
var maxClusterZoomLevel = 8;

//The URL to the store location data.
var storeLocationDataUrl = '/storeLocator/data/customerLocation.txt';

//The URL to the icon image.
var iconImageUrl = '/storeLocator/images/iconRed.png';

//An array of country region ISO2 values to limit searches to.
var countrySet = ['US'];

var map, popup, datasource, iconLayer, centerMarker, searchURL;
var listItemTemplate =
  '<div class="listItem" onclick="itemSelected(\'{id}\')"><div class="listItem-title">{title}</div><br />{distance} miles away</div>';

function initialize() {
  //Initialize a map instance.
  map = new atlas.Map('myMap', {
    center: [-93.047747, 44.906151],
    zoom: 6,
    view: 'Auto',

    //Add your Azure Maps subscription key to the map SDK. Get an Azure Maps key at https://azure.com/maps
    authOptions: {
      authType: 'subscriptionKey',
      subscriptionKey: 'Rsdu3vbWAqqPXAJxwEX4ESCyHCc7KBHwovsWx7UbmaI',
    },
  });

  //Create a popup but leave it closed so we can update it and display it later.
  popup = new atlas.Popup();

  //Use SubscriptionKeyCredential with a subscription key
  const subscriptionKeyCredential = new atlas.service.SubscriptionKeyCredential(
    atlas.getSubscriptionKey()
  );

  //Use subscriptionKeyCredential to create a pipeline
  const pipeline = atlas.service.MapsURL.newPipeline(
    subscriptionKeyCredential,
    {
      retryOptions: { maxTries: 4 }, // Retry options
    }
  );

  //Create an instance of the SearchURL client.
  searchURL = new atlas.service.SearchURL(pipeline);

  //If the user presses the search button, geocode the value they passed in.
  document.getElementById('searchBtn').onclick = performSearch;

  //If the user presses enter in the search textbox, perform a search.
  document.getElementById('searchTbx').onkeyup = function (e) {
    if (e.keyCode === 13) {
      performSearch();
    }
  };

  //If the user presses the My Location button, use the geolocation API to get the users location and center/zoom the map to that location.
  document.getElementById('myLocationBtn').onclick = setMapToUserLocation;

  //Wait until the map resources are ready.
  map.events.add('ready', function () {
    //Add the zoom control to the map.
    map.controls.add(new atlas.control.ZoomControl(), {
      position: 'top-left',
    });

    //Add an HTML marker to the map to indicate the center used for searching.
    centerMarker = new atlas.HtmlMarker({
      htmlContent: '<div class="mapCenterIcon"></div>',
      position: map.getCamera().center,
    });

    map.markers.add(centerMarker);

    //Create a data source and add it to the map and enable clustering.
    datasource = new atlas.source.DataSource(null, {
      cluster: true,
      clusterMaxZoom: maxClusterZoomLevel - 1,
    });

    map.sources.add(datasource);

    //Load all the store data now that the data source has been defined.
    loadStoreData();

    //Create a bubble layer for rendering clustered data points.
    var clusterBubbleLayer = new atlas.layer.BubbleLayer(datasource, null, {
      radius: 12,
      color: '#007faa',
      strokeColor: 'white',
      strokeWidth: 2,
      filter: ['has', 'point_count'], //Only render data points which have a point_count property, which clusters do.
    });

    //Create a symbol layer to render the count of locations in a cluster.
    var clusterLabelLayer = new atlas.layer.SymbolLayer(datasource, null, {
      iconOptions: {
        image: 'none', //Hide the icon image.
      },
      textOptions: {
        textField: ['get', 'point_count_abbreviated'],
        size: 12,
        font: ['StandardFont-Bold'],
        offset: [0, 0.4],
        color: 'white',
      },
    });

    map.layers.add([clusterBubbleLayer, clusterLabelLayer]);

    //Load a custom image icon into the map resources.
    map.imageSprite.add('myCustomIcon', iconImageUrl).then(function () {
      //Create a layer to render a coffe cup symbol above each bubble for an individual location.
      iconLayer = new atlas.layer.SymbolLayer(datasource, null, {
        iconOptions: {
          //Pass in the id of the custom icon that was loaded into the map resources.
          image: 'myCustomIcon',

          //Optionally scale the size of the icon.
          font: ['SegoeUi-Bold'],

          //Anchor the center of the icon image to the coordinate.
          anchor: 'center',

          //Allow the icons to overlap.
          allowOverlap: true,
        },
        filter: ['!', ['has', 'point_count']], //Filter out clustered points from this layer.
      });

      map.layers.add(iconLayer);

      //When the mouse is over the cluster and icon layers, change the cursor to be a pointer.
      map.events.add('mouseover', [clusterBubbleLayer, iconLayer], function () {
        map.getCanvasContainer().style.cursor = 'pointer';
      });

      //When the mouse leaves the item on the cluster and icon layers, change the cursor back to the default which is grab.
      map.events.add('mouseout', [clusterBubbleLayer, iconLayer], function () {
        map.getCanvasContainer().style.cursor = 'grab';
      });

      //Add a click event to the cluster layer. When someone clicks on a cluster, zoom into it by 2 levels.
      map.events.add('click', clusterBubbleLayer, function (e) {
        map.setCamera({
          center: e.position,
          zoom: map.getCamera().zoom + 1,
        });
      });

      //Add a click event to the icon layer and show the shape that was clicked.
      map.events.add('click', iconLayer, function (e) {
        showPopup(e.shapes[0]);
      });

      //Add an event to monitor when the map has finished moving.
      map.events.add('render', function () {
        //Give the map a chance to move and render data before updating the list.
        updateListItems();
      });
    });
  });
}

function loadStoreData() {
  //Download the store location data.
  fetch(storeLocationDataUrl)
    .then((response) => response.text())
    .then(function (text) {
      //Parse the Tab delimited file data into GeoJSON features.
      var features = [];

      //Split the lines of the file.
      var lines = text.split('\n');

      //Grab the header row.
      var row = lines[0].split('\t');

      //Parse the header row and index each column, so that when our code for parsing each row is easier to follow.
      var header = {};
      var numColumns = row.length;
      var i;

      for (i = 0; i < row.length; i++) {
        header[row[i]] = i;
      }

      //Skip the header row and then parse each row into a GeoJSON feature.
      for (i = 1; i < lines.length; i++) {
        row = lines[i].split('\t');

        //Ensure that the row has the right number of columns.
        if (row.length >= numColumns) {
          features.push(
            new atlas.data.Feature(
              new atlas.data.Point([
                parseFloat(row[header['Longitude']]),
                parseFloat(row[header['Latitude']]),
              ]),
              {
                AddressLine: row[header['AddressLine']],
                City: row[header['City']],
                Municipality: row[header['Municipality']],
                AdminDivision: row[header['AdminDivision']],
                Country: row[header['Country']],
                PostCode: row[header['PostCode']],
                Phone: row[header['Phone']],
                Customer: row[header['Customer']],
                Fax: row[header['Fax']],
              }
            )
          );
        }
      }

      //Add the features to the data source.
      datasource.add(features);

      //Initially update the list items.
      updateListItems();
    });
}

function performSearch() {
  var query = document.getElementById('searchTbx').value;

  //Perform a fuzzy search on the users query.
  searchURL
    .searchFuzzy(atlas.service.Aborter.timeout(3000), query, {
      //Pass in the array of country ISO2 for which we want to limit the search to.
      countrySet: countrySet,
      view: 'Auto',
    })
    .then((results) => {
      //Parse the response into GeoJSON so that the map can understand.
      var data = results.geojson.getFeatures();

      if (data.features.length > 0) {
        //Set the camera to the bounds of the results.
        map.setCamera({
          bounds: data.features[0].bbox,
          padding: 40,
        });
      } else {
        document.getElementById('listPanel').innerHTML =
          '<div class="statusMessage">Unable to find the location you searched for.</div>';
      }
    });
}

function setMapToUserLocation() {
  //Request the user's location.
  navigator.geolocation.getCurrentPosition(
    function (position) {
      //Convert the geolocation API position into a longitude/latitude position value the map can understand and center the map over it.
      map.setCamera({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: maxClusterZoomLevel + 1,
      });
    },
    function (error) {
      //If an error occurs when trying to access the users position information, display an error message.
      switch (error.code) {
        case error.PERMISSION_DENIED:
          alert('User denied the request for Geolocation.');
          break;
        case error.POSITION_UNAVAILABLE:
          alert('Position information is unavailable.');
          break;
        case error.TIMEOUT:
          alert('The request to get user position timed out.');
          break;
        case error.UNKNOWN_ERROR:
          alert('An unknown error occurred.');
          break;
      }
    }
  );
}

function updateListItems() {
  //Hide the center marker.
  centerMarker.setOptions({
    visible: false,
  });

  //Get the current camera/view information for the map.
  var camera = map.getCamera();

  var listPanel = document.getElementById('listPanel');

  //Check to see if the user is zoomed out a lot. If they are, tell them to zoom in closer, perform a search or press the My Location button.
  if (camera.zoom < maxClusterZoomLevel) {
    //Close the popup as clusters may be displayed on the map.
    popup.close();

    listPanel.innerHTML =
      '<div class="statusMessage">Search for a location, zoom the map, or press the "My Location" button to see individual locations.</div>';
  } else {
    //Update the location of the centerMarker.
    centerMarker.setOptions({
      position: camera.center,
      visible: true,
    });

    //List the ten closest locations in the side panel.
    var html = [],
      properties;

    /*
            Generating HTML for each item that looks like this:

            <div class="listItem" onclick="itemSelected('id')">
                <div class="listItem-title">1 Microsoft Way</div>
                Redmond, WA 98052<br />
                Open until 9:00 PM<br />
                0.7 miles away
            </div>
         */

    //Get all the shapes that have been rendered in the bubble layer.
    var data = map.layers.getRenderedShapes(map.getCamera().bounds, [
      iconLayer,
    ]);

    //Create an index of the distances of each shape.
    var distances = {};

    data.forEach(function (shape) {
      if (shape instanceof atlas.Shape) {
        //Calculate the distance from the center of the map to each shape and store in the index. Round to 2 decimals.
        distances[shape.getId()] =
          Math.round(
            atlas.math.getDistanceTo(
              camera.center,
              shape.getCoordinates(),
              'miles'
            ) * 100
          ) / 100;
      }
    });

    //Sort the data by distance.
    data.sort(function (x, y) {
      return distances[x.getId()] - distances[y.getId()];
    });

    data.forEach(function (shape) {
      properties = shape.getProperties();

      html.push(
        '<div class="listItem" onclick="itemSelected(\'',
        shape.getId(),
        '\')"><div class="listItem-title">',
        properties['Customer'],
        '</div>',
        properties['AddressLine'],
        '<br />',
        properties['City'],
        ',',
        '&nbsp;',
        properties['AdminDivision'],
        //Get a formatted address line 2 value that consists of City, Municipality, AdminDivision, and PostCode.

        '<br />',

        //Get the distance of the shape.
        distances[shape.getId()],
        ' miles away</div>'
      );
    });

    listPanel.innerHTML = html.join('');

    //Scroll to the top of the list panel incase the user has scrolled down.
    listPanel.scrollTop = 0;
  }
}

//When a user clicks on a result in the side panel, look up the shape by its id value and show popup.
function itemSelected(id) {
  //Get the shape from the data source using it's id.
  var shape = datasource.getShapeById(id);
  showPopup(shape);

  //Center the map over the shape on the map.
  var center = shape.getCoordinates();
  var offset;

  //If the map is less than 700 pixels wide, then the layout is set for small screens.
  if (map.getCanvas().width < 700) {
    //When the map is small, offset the center of the map relative to the shape so that there is room for the popup to appear.
    offset = [0, -80];
  }

  map.setCamera({
    center: center,
    centerOffset: offset,
  });
}

function showPopup(shape) {
  var properties = shape.getProperties();

  /*
        Generating HTML for the popup that looks like this:

         <div class="storePopup">
                <div class="popupTitle">
                    3159 Tongass Avenue
                    <div class="popupSubTitle">Ketchikan, AK 99901</div>
                </div>
                <div class="popupContent">
                    Open until 22:00 PM<br/>
                    <img title="Phone Icon" src="images/PhoneIcon.png">
                    <a href="tel:1-800-XXX-XXXX">1-800-XXX-XXXX</a>
                    <br>Amenities:
                    <img title="Wi-Fi Hotspot" src="images/WiFiIcon.png">
                    <img title="Wheelchair Accessible" src="images/WheelChair-small.png">
                </div>
            </div>
     */

  //Calculate the distance from the center of the map to the shape in miles, round to 2 decimals.
  var distance =
    Math.round(
      atlas.math.getDistanceTo(
        map.getCamera().center,
        shape.getCoordinates(),
        'miles'
      ) * 100
    ) / 100;

  var html = ['<div class="storePopup">'];

  html.push(
    '<div class="popupTitle">',
    properties['Customer'],
    '<div class="popupSubTitle">',
    '</div></div><div class="popupContent">',
    properties['AddressLine'],
    '<br/>',
    properties['City'],
    '&nbsp;',
    properties['AdminDivision'],
    '&nbsp;',
    properties['PostCode'],
    //Convert the closing time into a nicely formated time.
    // getOpenTillTime(properties),
    //Add the distance information.
    '<br/>',
    distance,
    ' miles away',
    '<br /><img src="/storeLocator/images/PhoneIcon.png" title="Phone Icon"/><a href="tel:',
    properties['Phone'],
    '">',
    properties['Phone'],
    '</a>',
    '<br /><img src="/storeLocator/images/PhoneIcon.png" title="Phone Icon"/>Fax: <a href="tel:',
    properties['Fax'],
    '">',
    properties['Fax'],
    '</a>'
  );

  html.push('</div></div>');

  //Update the content and position of the popup for the specified shape information.
  popup.setOptions({
    //Create a table from the properties in the feature.
    content: html.join(''),
    position: shape.getCoordinates(),
  });

  //Open the popup.
  popup.open(map);
}

//Creates an addressLine2 string consisting of City, Municipality, AdminDivision, and PostCode.
function getAddressLine2(properties) {
  var html = [properties['City']];

  if (properties['AdminDivision']) {
    html.push(', ', properties['AdminDivision']);
  }

  if (properties['PostCode']) {
    html.push(' ', properties['PostCode']);
  }
  if (properties['Customer']) {
    html.push(' ', properties['Customer']);
  }
  if (properties['Fax']) {
    html.push(' ', properties['Fax']);
  }

  return html.join('');
}

//Initialize the application when the page is loaded.
window.onload = initialize;
