import 'package:flutter_test/flutter_test.dart';
import 'package:user/features/user_app/location_search.dart';

Future<Map<String, dynamic>> _reverse(double lat, double lon) async => {
  'display_name': 'Example address',
  'lat': lat + 0.001,
  'lon': lon + 0.001,
};

void main() {
  test(
    'coordinate formats retain the original point and use the reverse label',
    () async {
      for (final input in [
        '25.25, -86.5',
        '25.25 −86.5',
        'geo:25.25,-86.5?z=17',
        'long=-86.5; latitude:25.25',
        "25°15'0\"N 86°30'0\"W",
        '86.5 W, 25.25 N',
      ]) {
        final result = await const LocationSearch().resolve(
          input,
          reverse: _reverse,
        );
        expect(result?.place, {
          'lat': 25.25,
          'lon': -86.5,
          'display_name': 'Example address',
        }, reason: input);
      }
      expect(
        await const LocationSearch().resolve(
          '123 Main Street',
          reverse: _reverse,
        ),
        isNull,
      );
      await expectLater(
        const LocationSearch().resolve('91,20', reverse: _reverse),
        throwsStateError,
      );
    },
  );

  test(
    'map links distinguish the pin from the viewport and use route endpoints',
    () async {
      final resolver = LocationSearch(
        redirect: (_) async => Uri.parse(
          'https://www.google.co.in/maps/place/Example/@28,77,15z/data=!8m2!3d25.25!4d86.5',
        ),
      );
      final short = await resolver.resolve(
        'Pin: https://maps.app.goo.gl/safePin',
        reverse: _reverse,
      );
      expect(short?.place?['lat'], 25.25);
      expect(short?.place?['lon'], 86.5);
      final long =
          'https://www.google.com/maps/dir/?api=1&origin=25.2%2C86.8&destination=25.3%2C86.9';
      expect(
        (await resolver.resolve(
          long,
          pickup: true,
          reverse: _reverse,
        ))?.place?['lat'],
        25.2,
      );
      expect(
        (await resolver.resolve(long, reverse: _reverse))?.place?['lat'],
        25.3,
      );
      expect(
        (await resolver.resolve(
          'maps.google.com/maps/search/?api=1&query=Central+Station',
          reverse: _reverse,
        ))?.query,
        'Central Station',
      );
    },
  );

  test(
    'exact coordinates stay usable offline and redirects to other hosts are rejected',
    () async {
      final offline = await const LocationSearch().resolve(
        'https://www.openstreetmap.org/?mlat=25.26&mlon=86.97#map=15/25/87',
        reverse: (_, _) async => throw StateError('Offline'),
      );
      expect(offline?.place?['display_name'], '25.26, 86.97');
      var calls = 0;
      final resolver = LocationSearch(
        redirect: (_) async {
          calls++;
          return Uri.parse('https://example.test/maps?q=25,86');
        },
      );
      await expectLater(
        resolver.resolve('https://maps.app.goo.gl/redirect', reverse: _reverse),
        throwsStateError,
      );
      expect(calls, 1);
      await expectLater(
        resolver.resolve(
          'https://maps.app.goo.gl@example.test/redirect',
          reverse: _reverse,
        ),
        throwsStateError,
      );
      expect(calls, 1);
    },
  );
}
