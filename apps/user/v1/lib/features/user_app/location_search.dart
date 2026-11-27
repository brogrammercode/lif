import 'dart:io';

typedef _Point = (double, double);
typedef LocationSearchResult = ({Map<String, dynamic>? place, String? query});

class LocationSearch {
  const LocationSearch({this.redirect});
  final Future<Uri?> Function(Uri)? redirect;

  static final _url = RegExp(
    r'''(?:https?://|(?:(?:www|maps)\.)?google\.[a-z.]+/|maps\.app\.goo\.gl/|goo\.gl/maps/|maps\.apple\.com/|(?:www\.)?openstreetmap\.org/)[^\s<>"']+''',
    caseSensitive: false,
  );
  static const _number = r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)';
  static final _decimal = RegExp(
    r'^\(?\s*(' + _number + r')\s*[,;\s]\s*(' + _number + r')\s*\)?$',
  );
  static final _labeled = RegExp(
    r'^(lat(?:itude)?|lon(?:g(?:itude)?)?|lng)(?:\s*[:=]\s*|\s+)(' +
        _number +
        r')\s*[,;&\s]+\s*(lat(?:itude)?|lon(?:g(?:itude)?)?|lng)(?:\s*[:=]\s*|\s+)(' +
        _number +
        r')$',
    caseSensitive: false,
  );
  static final _directional = RegExp(
    r"""(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEW])""",
    caseSensitive: false,
  );
  static final _pin = RegExp('!3d($_number)!4d($_number)');

  static _Point? _valid(double? lat, double? lon) =>
      lat != null && lon != null && lat.abs() <= 90 && lon.abs() <= 180
      ? (lat, lon)
      : null;

  static _Point? _coordinates(String value) {
    final text = value.trim().replaceAll('−', '-');
    final geo = text.toLowerCase().startsWith('geo:')
        ? text.substring(4).split(RegExp(r'[?;]')).first
        : text;
    final pair = _decimal.firstMatch(geo);
    if (pair != null) {
      return _valid(double.tryParse(pair[1]!), double.tryParse(pair[2]!));
    }
    final labeled = _labeled.firstMatch(text);
    if (labeled != null) {
      final latitudeFirst = labeled[1]!.toLowerCase().startsWith('lat');
      if (latitudeFirst == labeled[3]!.toLowerCase().startsWith('lat')) {
        return null;
      }
      final a = double.tryParse(labeled[2]!);
      final b = double.tryParse(labeled[4]!);
      return latitudeFirst ? _valid(a, b) : _valid(b, a);
    }
    final directions = _directional.allMatches(text).toList();
    if (directions.length != 2 ||
        !RegExp(r'^[,\s;()]*$').hasMatch(text.replaceAll(_directional, ''))) {
      return null;
    }
    double? lat;
    double? lon;
    for (final part in directions) {
      final minutes = double.parse(part[2] ?? '0');
      final seconds = double.parse(part[3] ?? '0');
      if (minutes >= 60 || seconds >= 60) return null;
      final direction = part[4]!.toUpperCase();
      final sign = direction == 'S' || direction == 'W' ? -1 : 1;
      final value =
          sign * (double.parse(part[1]!) + minutes / 60 + seconds / 3600);
      if (direction == 'N' || direction == 'S') {
        lat = value;
      } else {
        lon = value;
      }
    }
    return _valid(lat, lon);
  }

  static bool recognizes(String text) =>
      _url.hasMatch(text) ||
      text.trim().toLowerCase().startsWith('geo:') ||
      _decimal.hasMatch(text.trim().replaceAll('−', '-')) ||
      _coordinates(text) != null;

  Future<LocationSearchResult?> resolve(
    String text, {
    required Future<Map<String, dynamic>> Function(double, double) reverse,
    bool pickup = false,
  }) async {
    var point = _coordinates(text);
    String? query;
    if (point == null) {
      final match = _url.firstMatch(text);
      if (match == null) {
        if (recognizes(text)) throw StateError('Enter valid coordinates.');
        return null;
      }
      final link = match[0]!.replaceFirst(RegExp(r'[),.;]+$'), '');
      var uri = Uri.tryParse(link.contains('://') ? link : 'https://$link');
      for (var hop = 0; uri != null && _short(uri) && hop < 4; hop++) {
        uri = await (redirect ?? _redirect)(
          uri,
        ).timeout(const Duration(seconds: 5));
      }
      if (uri == null || !_map(uri)) {
        throw StateError(
          'Could not resolve this map link. Try copying the pin coordinates.',
        );
      }
      (point, query) = _fromMap(uri, pickup);
    }
    if (point == null) {
      if (query != null && query.trim().isNotEmpty) {
        return (place: null, query: query.trim());
      }
      throw StateError(
        'This map link has no readable pin. Try copying its coordinates.',
      );
    }
    final (lat, lon) = point;
    Map<String, dynamic> address = const {};
    try {
      address = await reverse(lat, lon).timeout(const Duration(seconds: 6));
    } catch (_) {
      // Preserve the exact point if reverse geocoding is unavailable.
    }
    final display = '${address['display_name'] ?? ''}'.trim();
    return (
      place: {
        ...address,
        'display_name': display.isEmpty ? '$lat, $lon' : display,
        'lat': lat,
        'lon': lon,
      },
      query: null,
    );
  }

  static bool _safe(Uri uri) =>
      (uri.scheme == 'https' || uri.scheme == 'http') &&
      uri.userInfo.isEmpty &&
      (!uri.hasPort || uri.port == (uri.scheme == 'https' ? 443 : 80));

  static bool _short(Uri uri) =>
      _safe(uri) &&
      ((uri.host == 'maps.app.goo.gl' && uri.pathSegments.isNotEmpty) ||
          (uri.host == 'goo.gl' && uri.path.startsWith('/maps/')));

  static final _google = RegExp(
    r'^(?:(?:www|maps)\.)?google\.(?:com|(?:com\.|co\.)?[a-z]{2})$',
  );

  static bool _map(Uri uri) =>
      _safe(uri) &&
      ((_google.hasMatch(uri.host) &&
              (uri.host.startsWith('maps.') ||
                  uri.path == '/maps' ||
                  uri.path.startsWith('/maps/'))) ||
          const {
            'maps.apple.com',
            'openstreetmap.org',
            'www.openstreetmap.org',
          }.contains(uri.host));

  static (_Point?, String?) _fromMap(Uri uri, bool pickup) {
    final params = uri.queryParameters;
    final path = uri.pathSegments;
    final directions = path.indexOf('dir');
    if (directions != -1 ||
        params.containsKey('destination') ||
        params.containsKey('origin') ||
        params.containsKey('daddr') ||
        params.containsKey('saddr')) {
      final index = directions + (pickup ? 1 : 2);
      final endpoint =
          (pickup
              ? params['origin'] ?? params['saddr']
              : params['destination'] ?? params['daddr']) ??
          (directions != -1 && index < path.length ? path[index] : null);
      if (endpoint != null && !endpoint.startsWith('@')) {
        return (_coordinates(endpoint), endpoint);
      }
      return (null, null);
    }
    final pin =
        _pin.firstMatch(path.join('/')) ??
        _pin.firstMatch(params['data'] ?? '');
    if (pin != null) {
      final point = _valid(double.tryParse(pin[1]!), double.tryParse(pin[2]!));
      if (point != null) return (point, null);
    }
    for (final key in ['query', 'q', 'll', 'center', 'sll']) {
      final value = params[key];
      if (value == null) continue;
      final point = _coordinates(value);
      if (point != null) return (point, null);
    }
    final named = path.indexOf('place');
    final search = path.indexOf('search');
    final name =
        params['query'] ??
        params['q'] ??
        (named >= 0 && named + 1 < path.length
            ? path[named + 1].replaceAll('+', ' ')
            : null) ??
        (search >= 0 && search + 1 < path.length
            ? path[search + 1].replaceAll('+', ' ')
            : null);
    if (name != null && name.isNotEmpty) return (_coordinates(name), name);
    final lat = double.tryParse(params['mlat'] ?? params['lat'] ?? '');
    final lon = double.tryParse(
      params['mlon'] ?? params['lon'] ?? params['lng'] ?? '',
    );
    final explicit = _valid(lat, lon);
    if (explicit != null) return (explicit, null);
    final center = path.where((part) => part.startsWith('@')).firstOrNull;
    if (center != null) {
      return (
        _coordinates(center.substring(1).split(',').take(2).join(',')),
        null,
      );
    }
    final osm = RegExp(r'^map=[^/]+/([^/]+)/([^/]+)$').firstMatch(uri.fragment);
    return (osm == null ? null : _coordinates('${osm[1]},${osm[2]}'), null);
  }

  static Future<Uri?> _redirect(Uri uri) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 4);
    try {
      // Never fetch the redirect target unless it is another map short link.
      final request = await client.getUrl(
        uri.replace(scheme: 'https', port: 443),
      );
      request.followRedirects = false;
      final response = await request.close().timeout(
        const Duration(seconds: 4),
      );
      final location = response.headers.value(HttpHeaders.locationHeader);
      if (response.statusCode < 300 ||
          response.statusCode >= 400 ||
          location == null) {
        return null;
      }
      return uri.resolve(location);
    } finally {
      client.close(force: true);
    }
  }
}
