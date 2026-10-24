import 'package:flutter_test/flutter_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/features/driver_operations/navigation_progress.dart';

void main() {
  const route = [
    LatLng(25.23, 86.95),
    LatLng(25.235, 86.95),
    LatLng(25.24, 86.95),
  ];
  final steps = [
    {
      'distance': 556,
      'name': 'First road',
      'maneuver': {
        'type': 'depart',
        'location': [86.95, 25.23],
      },
    },
    {
      'distance': 556,
      'name': 'Second road',
      'maneuver': {
        'type': 'turn',
        'modifier': 'right',
        'location': [86.95, 25.235],
      },
    },
    {
      'distance': 0,
      'name': '',
      'maneuver': {
        'type': 'arrive',
        'location': [86.95, 25.24],
      },
    },
  ];
  test(
    'navigation follows polyline progress and announces the upcoming maneuver',
    () {
      final start = NavigationProgress.calculate(route.first, route, steps);
      final halfway = NavigationProgress.calculate(
        const LatLng(25.236, 86.95),
        route,
        steps,
      );
      expect(start.instruction, contains('turn right'));
      expect(start.offRouteMetres, lessThan(1));
      expect(halfway.remainingMetres, lessThan(start.remainingMetres));
      expect(halfway.instruction, 'Arrive at your destination');
    },
  );
  test('deviations can trigger rerouting without inventing a route', () {
    final off = NavigationProgress.calculate(
      const LatLng(25.235, 86.952),
      route,
      steps,
    );
    expect(off.offRouteMetres, greaterThan(60));
    expect(
      NavigationProgress.calculate(route.first, [], []).offRouteMetres,
      double.infinity,
    );
  });
  test('the approaching turn remains visible in its final ten metres', () {
    final approaching = NavigationProgress.calculate(
      const LatLng(25.23495, 86.95),
      route,
      steps,
    );
    expect(approaching.nextTurnMetres, inExclusiveRange(0, 10));
    expect(approaching.instruction, contains('turn right'));
    final passed = NavigationProgress.calculate(
      const LatLng(25.2351, 86.95),
      route,
      steps,
    );
    expect(passed.instruction, 'Arrive at your destination');
  });
}
