import 'package:maplibre_gl/maplibre_gl.dart' show LatLng;

class HomeConstants {
  static const String MAP_STYLE_URL =
      'https://tiles.openfreemap.org/styles/liberty';

  static const LatLng DEFAULT_LOCATION = LatLng(-6.200000, 106.816666);
  static const double DEFAULT_ZOOM = 16.5;
  static const double MAP_TILT = 48;

  static const String TEXT_LOCATING_YOU = 'Locating you...';
  static const String TEXT_CANCEL = 'Cancel';
  static const String TEXT_EMOJI = '\u{1F914}';
  static const String TEXT_FAKE_CAR = '...';

  static const String TEXT_GOOD_TIME = 'Good time to go';
  static const String TEXT_NOW = 'Now';
  static const String TEXT_LETS_GO = 'Lets go to';
  static const String TEXT_HOME = 'Home';
  static const Map<String, String> VEHICLE_IMAGE_URLS = {
    'BIKE':
        'https://images.unsplash.com/photo-1558981420-8ceaa10c9c30?auto=format&fit=crop&w=200&q=80',
    'SCOOTER':
        'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&w=200&q=80',
    'AUTO':
        'https://images.unsplash.com/photo-1591768793355-74d04bb6608f?auto=format&fit=crop&w=200&q=80',
    'SEDAN':
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=200&q=80',
    'SUV':
        'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=200&q=80',
  };
}
