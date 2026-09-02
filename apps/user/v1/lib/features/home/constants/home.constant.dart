import 'package:latlong2/latlong.dart' hide Path;

class HomeConstants {
  static const String OPEN_STREET_MAP_TILE_URL =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  static const String LIGHT_TILE_URL =
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
  static const String FALLBACK_TILE_URL = LIGHT_TILE_URL;

  static const LatLng DEFAULT_LOCATION = LatLng(-6.200000, 106.816666);
  static const double DEFAULT_ZOOM = 16.5;
  static const String MAP_USER_AGENT = 'com.example.v1';
  static const List<String> MAP_SUBDOMAINS = ['a', 'b', 'c', 'd'];

  static const String TILE_USER_AGENT_HEADER_NAME = 'User-Agent';
  static const String TILE_USER_AGENT_HEADER_VALUE =
      'V1Mobile/1.0 (com.example.v1)';

  static Map<String, String> get tileHeaders => {
    TILE_USER_AGENT_HEADER_NAME: TILE_USER_AGENT_HEADER_VALUE,
  };

  static const String TEXT_LOCATING_YOU = 'Locating you...';
  static const String TEXT_CANCEL = 'Cancel';
  static const String TEXT_EMOJI = '\u{1F914}';
  static const String TEXT_FAKE_CAR = '...';

  static const String PROFILE_IMAGE_URL =
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

  static const String TEXT_GOOD_TIME = 'Good time to go';
  static const String TEXT_NOW = 'Now';
  static const String TEXT_LETS_GO = 'Lets go to';
  static const String TEXT_HOME = 'Home';
}
