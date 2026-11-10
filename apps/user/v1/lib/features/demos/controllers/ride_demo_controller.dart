import 'dart:convert';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/state/feature_controller.dart';

enum RideDemoStep {
  home,
  locations,
  vehicles,
  searching,
  assigned,
  arriving,
  arrived,
  inProgress,
  completed,
  cancelled,
  unfulfilled,
}

/// All demo records and transitions live here, never in production widgets.
class RideDemoController extends FeatureController {
  static const tripId = 'demo-trip';
  static const riderId = 'demo-rider';
  // Demo-only photography. Keep these values in the controller fixture so the
  // production views can render the same image fields as live API records.
  static const _riderAvatar =
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80';
  static const _driverAvatar =
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&q=80';
  static const _stationPhoto =
      'https://images.unsplash.com/photo-1692395445997-d2098b8726e7?auto=format&fit=crop&w=900&q=85';
  static const _cityPhoto =
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=900&q=85';
  static const _cityPhotoAlt =
      'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=900&q=85';
  static const _stationPhotoAlt =
      'https://images.unsplash.com/photo-1687317587523-d3e2eb5289e4?auto=format&fit=crop&w=900&q=85';
  static const _demoBrandLogoUrl =
      'https://res.cloudinary.com/drxuvrw65/image/upload/v1792684132/1more-admin/vehicle-brands/74618f08-2e02-44c2-a9d5-42213978f227.webp';
  static const _categoryImages = {
    'BIKE':
        'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312100/1more-admin/vehicle-categories/ba556f0c-7fbd-457d-b29f-265c65db5a45.webp',
    'SCOOTER':
        'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312136/1more-admin/vehicle-categories/58ba7371-50e5-4160-a8a2-da47ce15211b.webp',
    'AUTO':
        'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312171/1more-admin/vehicle-categories/7c04e89d-53c6-4c7d-99d6-19426ff28ecb.webp',
    'SEDAN':
        'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312253/1more-admin/vehicle-categories/573d83dd-92e3-4d0b-8192-a268b324ea36.webp',
    'SUV':
        'https://res.cloudinary.com/drxuvrw65/image/upload/v1794312264/1more-admin/vehicle-categories/a7629980-03b1-47ec-a253-6d926e1c6af8.webp',
  };
  late final DioClient transport = DemoTransport(this);
  RideDemoStep step = RideDemoStep.home;
  int navigationRevision = 0;
  String status = 'DRAFT', method = 'CASH', category = 'demo-car';
  int passengers = 1;
  String note = '';
  DateTime _stageChangedAt = DateTime.now();
  bool riderConfirmed = false, driverVerified = false;
  Map<String, dynamic>? rating;
  final List<Map<String, dynamic>> messages = [];
  DateTime _created = DateTime.now();
  late Map<String, dynamic> endpoints = _defaultEndpoints();
  final _keys = <String, String>{};

  Map<String, dynamic> _defaultEndpoints() => {
    'pickup': {
      'address': 'Tilka Manjhi Chowk, Bhagalpur',
      'latitude': 25.2568,
      'longitude': 86.9842,
    },
    'dropoff': {
      'address': 'Bhagalpur Railway Station',
      'latitude': 25.2418,
      'longitude': 86.9744,
    },
  };
  Map<String, dynamic> get profile => {
    'id': riderId,
    'first_name': 'Aarav',
    'last_name': 'Sharma',
    'avatar_url': _riderAvatar,
    'email': 'rider@example.test',
    'phone_e164': '+919000000001',
  };
  Map<String, dynamic> get driver => {
    'id': 'demo-driver',
    'user_id': 'demo-driver-user',
    'rating_average': 4.8,
    'ratings_count': 124,
    'user': {
      'id': 'demo-driver-user',
      'first_name': 'Rohan',
      'last_name': 'Kumar',
      'avatar_url': _driverAvatar,
    },
  };
  Map<String, dynamic> get vehicle => vehicleFor(category);
  Map<String, dynamic> vehicleFor(String quoteId) {
    final bike = quoteId == 'demo-bike', xl = quoteId == 'demo-xl';
    return {
      'id': 'demo-vehicle-$quoteId',
      'make': bike ? 'Hero' : 'Maruti Suzuki',
      'brand': {
        'name': bike ? 'Hero' : 'Maruti Suzuki',
        'logo_url': _demoBrandLogoUrl,
      },
      'model': bike
          ? 'Splendor Plus'
          : xl
          ? 'Ertiga'
          : 'Dzire',
      'plate_number': bike ? 'BR10 CD4567' : 'BR10 AB1234',
      'color': bike ? 'Black' : 'White',
      'type': bike
          ? 'BIKE'
          : xl
          ? 'SUV'
          : 'SEDAN',
      'capacity': bike
          ? 1
          : xl
          ? 6
          : 4,
      'photo_url':
          _categoryImages[bike
              ? 'BIKE'
              : xl
              ? 'SUV'
              : 'SEDAN'],
    };
  }

  List<Map<String, dynamic>> get places => [
    {
      'id': 'demo-station',
      'name': 'Bhagalpur Railway Station',
      'label': 'Station',
      'address': endpoints['dropoff']['address'],
      'latitude': endpoints['dropoff']['latitude'],
      'longitude': endpoints['dropoff']['longitude'],
      'photos': [
        {'url': _stationPhoto},
        {'url': _stationPhotoAlt},
      ],
      'place_type': 'OTHER',
    },
    {
      'id': 'demo-pickup',
      'name': 'Tilka Manjhi Chowk',
      'label': 'Home',
      'address': endpoints['pickup']['address'],
      'latitude': endpoints['pickup']['latitude'],
      'longitude': endpoints['pickup']['longitude'],
      'photos': [
        {'url': _cityPhoto},
        {'url': _cityPhotoAlt},
      ],
      'place_type': 'HOME',
    },
  ];
  List<List<double>> get geometry => [
    [endpoints['pickup']['longitude'], endpoints['pickup']['latitude']],
    [86.9819, 25.2529],
    [86.9788, 25.2489],
    [endpoints['dropoff']['longitude'], endpoints['dropoff']['latitude']],
  ].map((p) => p.map((v) => (v as num).toDouble()).toList()).toList();
  Map<String, dynamic> get route => {
    'geometry': geometry,
    'distance_m': 2800,
    'duration_s': 540,
  };
  Map<String, dynamic> get quote => {
    'id': tripId,
    'quotes': [
      for (final entry in [
        ('demo-bike', 'Bike', 'BIKE', 1, 38),
        ('demo-car', 'Comfort', 'SEDAN', 4, 96),
        ('demo-xl', 'Family', 'SUV', 6, 145),
      ])
        {
          'id': entry.$1,
          'vehicle_category_id': entry.$1,
          'vehicle_type': entry.$3,
          'distance_m': 2800,
          'duration_s': 540,
          'total_fare': entry.$5,
          'expires_at': _created
              .add(const Duration(hours: 24))
              .toIso8601String(),
          'currency': 'INR',
          'category_snapshot': {
            'name': entry.$2,
            'capacity': entry.$4,
            'image_url': _categoryImages[entry.$3],
            'payment_policy': {
              'cash_enabled': true,
              'direct_upi_enabled': true,
            },
          },
        },
    ],
  };
  Map<String, dynamic> get selectedQuote =>
      (quote['quotes'] as List).cast<Map<String, dynamic>>().firstWhere(
        (q) => q['id'] == category,
        orElse: () => (quote['quotes'] as List).first,
      );
  Map<String, dynamic> get contextData {
    final assigned = [
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVING',
      'DRIVER_WAITING',
      'IN_PROGRESS',
      'COMPLETED',
    ].contains(status);
    final now = DateTime.now().toIso8601String();
    final stageTime = _stageChangedAt.toIso8601String();
    final trip = {
      'id': tripId,
      'status': status,
      'pickup_address': endpoints['pickup']['address'],
      'pickup_latitude': endpoints['pickup']['latitude'],
      'pickup_longitude': endpoints['pickup']['longitude'],
      'dropoff_address': endpoints['dropoff']['address'],
      'dropoff_latitude': endpoints['dropoff']['latitude'],
      'dropoff_longitude': endpoints['dropoff']['longitude'],
      'created_at': _created.toIso8601String(),
      'requested_at': _created.toIso8601String(),
      'matched_at': assigned ? stageTime : null,
      'arrived_at':
          ['DRIVER_WAITING', 'IN_PROGRESS', 'COMPLETED'].contains(status)
          ? stageTime
          : null,
      'started_at': ['IN_PROGRESS', 'COMPLETED'].contains(status)
          ? stageTime
          : null,
      'completed_at': status == 'COMPLETED' ? now : null,
      'driver': assigned ? driver : null,
      'vehicle': assigned ? vehicle : null,
      'passenger_count': passengers,
      'rider_note': note,
      'collection_preference': method,
      'estimated_fare': selectedQuote['total_fare'],
      'final_fare': status == 'COMPLETED' ? selectedQuote['total_fare'] : null,
      'estimated_distance_m': 2800,
      'estimated_duration_s': 540,
      'actual_distance_m': status == 'COMPLETED' ? 2850 : null,
      'actual_duration_s': status == 'COMPLETED' ? 580 : null,
      'currency': 'INR',
      'quote': selectedQuote,
      'route': {'route_data': route},
      'review': rating,
      'events': [],
    };
    return {
      'ride_id': tripId,
      'is_driver': false,
      'status': status,
      'trip': trip,
      'server_time': now,
      'driver_location': assigned
          ? {'latitude': 25.2541, 'longitude': 86.9822, 'captured_at': now}
          : null,
      'driver_location_fresh': assigned,
      'settings': {'location_max_age_s': 60},
      'search_radius_km': 2,
      'free_wait_minutes': 5,
      'start': {
        'code': '162904',
        'rider_confirmed': riderConfirmed,
        'driver_verified': driverVerified,
        'locked': false,
      },
      'payment': {
        'status': status == 'COMPLETED' ? 'CAPTURED' : 'PENDING',
        'amount': selectedQuote['total_fare'],
        'collection_method': method,
        'method': method,
        'provider_managed': false,
      },
      'collection_preference': method,
      'direct_collection_allowed': false,
      'payment_options': {'cash': true, 'upi': false},
    };
  }

  static String label(RideDemoStep value) => switch (value) {
    RideDemoStep.home => 'Home',
    RideDemoStep.locations => 'Locations',
    RideDemoStep.vehicles => 'Vehicles',
    RideDemoStep.searching => 'Finding driver',
    RideDemoStep.assigned => 'Driver assigned',
    RideDemoStep.arriving => 'Driver arriving',
    RideDemoStep.arrived => 'Arrived / start code',
    RideDemoStep.inProgress => 'Ride in progress',
    RideDemoStep.completed => 'Completed',
    RideDemoStep.cancelled => 'Cancelled',
    RideDemoStep.unfulfilled => 'No driver found',
  };
  void preview(RideDemoStep value) {
    update(() {
      step = value;
      _stageChangedAt = DateTime.now();
      navigationRevision++;
      status = switch (value) {
        RideDemoStep.home ||
        RideDemoStep.locations ||
        RideDemoStep.vehicles => 'DRAFT',
        RideDemoStep.searching => 'SEARCHING',
        RideDemoStep.assigned => 'DRIVER_ASSIGNED',
        RideDemoStep.arriving => 'DRIVER_ARRIVING',
        RideDemoStep.arrived => 'DRIVER_WAITING',
        RideDemoStep.inProgress => 'IN_PROGRESS',
        RideDemoStep.completed => 'COMPLETED',
        RideDemoStep.cancelled => 'CANCELLED',
        RideDemoStep.unfulfilled => 'NO_DRIVER_FOUND',
      };
      riderConfirmed =
          value == RideDemoStep.inProgress || value == RideDemoStep.completed;
      driverVerified = riderConfirmed;
    });
  }

  void next() => preview(
    RideDemoStep.values[(step.index + 1).clamp(
      0,
      RideDemoStep.values.length - 1,
    )],
  );
  void restart() {
    _created = DateTime.now();
    note = '';
    endpoints = _defaultEndpoints();
    category = 'demo-car';
    passengers = 1;
    method = 'CASH';
    rating = null;
    messages.clear();
    _keys.clear();
    riderConfirmed = false;
    driverVerified = false;
    preview(RideDemoStep.home);
  }

  dynamic _copy(dynamic value) => jsonDecode(jsonEncode(value));
  Future<dynamic> request(
    String methodName,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Map<String, dynamic>? headers,
  }) async {
    if (isDisposed) throw StateError('This demo has ended.');
    final data = body is Map
        ? Map<String, dynamic>.from(body)
        : <String, dynamic>{};
    dynamic result;
    if (methodName == 'GET' && path == '/me') {
      result = profile;
    } else if (methodName == 'GET' && path == '/me/travel-context') {
      result = {
        'active_rider_ride':
            status != 'DRAFT' &&
                !['COMPLETED', 'CANCELLED', 'NO_DRIVER_FOUND'].contains(status)
            ? contextData['trip']
            : null,
      };
    } else if (methodName == 'GET' && path == '/me/saved-places') {
      result = places;
    } else if (methodName == 'GET' && path == '/places') {
      result = {'rows': places, 'total': places.length};
    } else if (methodName == 'GET' && path == '/geocode/search') {
      result = places
          .map(
            (p) => {
              'display_name': p['address'],
              'lat': '${p['latitude']}',
              'lon': '${p['longitude']}',
            },
          )
          .toList();
    } else if (methodName == 'GET' && path == '/geocode/reverse') {
      result = {'display_name': 'Selected demo location, Bhagalpur'};
    } else if (methodName == 'GET' && path == '/geocode/route') {
      result = route;
    } else if (methodName == 'POST' && path == '/rides/quote') {
      endpoints = _copy(data);
      step = RideDemoStep.vehicles;
      changed();
      result = quote;
    } else if (methodName == 'GET' && path == '/rides/availability') {
      result = {
        'items': [
          {
            'driver': driver,
            'vehicle': vehicleFor('${query?['quote_id'] ?? category}'),
            'distance_m': 620,
            'map_position': {'latitude': 25.254, 'longitude': 86.982},
          },
        ],
      };
    } else if (methodName == 'POST' && path == '/rides') {
      final key = '${headers?['Idempotency-Key']}';
      final encoded = jsonEncode(data);
      if (_keys.containsKey(key) && _keys[key] != encoded) {
        throw StateError('Demo booking key changed.');
      }
      if (_keys.containsKey(key)) {
        return {'status': 'success', 'data': _copy(contextData['trip'])};
      }
      _keys[key] = encoded;
      _stageChangedAt = DateTime.now();
      note = '${data['rider_note'] ?? ''}';
      category = '${data['quote_id']}';
      passengers = data['passenger_count'] as int? ?? 1;
      method = '${data['payment_preference']}';
      status = 'SEARCHING';
      step = RideDemoStep.searching;
      changed();
      result = contextData['trip'];
    } else if (methodName == 'GET' && path == '/rides/$tripId') {
      result = contextData['trip'];
    } else if (methodName == 'GET' && path == '/trips/$tripId/context') {
      result = contextData;
    } else if (methodName == 'GET' && path == '/trips/$tripId/rider-route') {
      result = {
        ...route,
        'target': status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP',
        'captured_at': DateTime.now().toIso8601String(),
        'distance_m': status == 'IN_PROGRESS' ? 1800 : 750,
        'duration_s': status == 'IN_PROGRESS' ? 360 : 180,
      };
    } else if (methodName == 'POST' && path == '/rides/$tripId/confirm-start') {
      riderConfirmed = true;
      changed();
      result = contextData;
    } else if (methodName == 'POST' && path == '/rides/$tripId/reviews') {
      rating = {'score': data['score'], 'comment': data['comment']};
      changed();
      result = rating;
    } else if (methodName == 'POST' && path == '/trips/$tripId/issues') {
      status = 'CANCELLED';
      step = RideDemoStep.cancelled;
      changed();
      result = contextData;
    } else if (methodName == 'POST' &&
        path == '/trips/$tripId/start-code/refresh') {
      changed();
      result = contextData;
    } else if (methodName == 'GET' && path == '/trips/$tripId/messages') {
      result = messages;
    } else if (methodName == 'POST' && path == '/trips/$tripId/messages') {
      messages.add({
        'id': data['client_key'],
        'sender_id': riderId,
        'body': data['body'],
        'created_at': DateTime.now().toIso8601String(),
      });
      changed();
      result = messages.last;
    } else if (methodName == 'GET' && path == '/support/configuration') {
      result = {'phone': null, 'email': null, 'whatsapp': null};
    } else {
      throw StateError(
        'This action is disabled in the UI demo: $methodName $path',
      );
    }
    return {'status': 'success', 'data': _copy(result)};
  }
}

/// Implements rather than subclasses the real singleton: no method can fall
/// through to real HTTP, secure storage, token refresh or account writes.
class DemoTransport implements DioClient {
  final RideDemoController controller;
  DemoTransport(this.controller);
  @override
  Future<dynamic> getData(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) => controller.request('GET', path, query: queryParameters);
  @override
  Future<dynamic> postData(
    String path, {
    Object? data,
    Map<String, dynamic>? headers,
    Duration? connectTimeout,
    Duration? receiveTimeout,
    Duration? sendTimeout,
  }) => controller.request('POST', path, body: data, headers: headers);
  @override
  Future<Map<String, double>?> readCachedUserLocation() async => {
    'latitude': (controller.endpoints['pickup']['latitude'] as num).toDouble(),
    'longitude': (controller.endpoints['pickup']['longitude'] as num)
        .toDouble(),
  };
  @override
  dynamic noSuchMethod(Invocation invocation) => throw StateError(
    'Real services are disabled in this demo (${invocation.memberName}).',
  );
}
