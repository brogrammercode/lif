import 'dart:math' as math;
import 'package:maplibre_gl/maplibre_gl.dart';

class NavigationProgress {
  final double offRouteMetres, remainingMetres, nextTurnMetres;
  final String instruction;
  const NavigationProgress(
    this.offRouteMetres,
    this.remainingMetres,
    this.nextTurnMetres,
    this.instruction,
  );
  static NavigationProgress calculate(
    LatLng current,
    List<LatLng> points,
    List<Map<String, dynamic>> steps,
  ) {
    if (points.length < 2) {
      return const NavigationProgress(
        double.infinity,
        0,
        0,
        'Waiting for a route',
      );
    }
    double along = 0, total = 0, best = double.infinity, progress = 0;
    final scaleX = 111320 * math.cos(current.latitude * math.pi / 180);
    for (var i = 1; i < points.length; i++) {
      final a = points[i - 1], b = points[i];
      final ax = (a.longitude - current.longitude) * scaleX,
          ay = (a.latitude - current.latitude) * 111320;
      final bx = (b.longitude - current.longitude) * scaleX,
          by = (b.latitude - current.latitude) * 111320;
      final dx = bx - ax, dy = by - ay, length = math.sqrt(dx * dx + dy * dy);
      final fraction = length == 0
          ? 0.0
          : ((-ax * dx - ay * dy) / (length * length)).clamp(0.0, 1.0);
      final distance = math.sqrt(
        math.pow(ax + fraction * dx, 2) + math.pow(ay + fraction * dy, 2),
      );
      if (distance < best) {
        best = distance;
        progress = along + fraction * length;
      }
      along += length;
      total += length;
    }
    double boundary = 0;
    var index = 0;
    for (var i = 0; i < steps.length; i++) {
      boundary += (steps[i]['distance'] as num? ?? 0).toDouble();
      index = i;
      if (boundary > progress) break;
    }
    final next = steps.isEmpty
        ? <String, dynamic>{}
        : steps[math.min(index + 1, steps.length - 1)];
    final maneuver = next['maneuver'] as Map? ?? {};
    final type = '${maneuver['type'] ?? 'continue'}'.replaceAll('_', ' ');
    final modifier = '${maneuver['modifier'] ?? ''}'.replaceAll('_', ' ');
    final road = '${next['name'] ?? ''}'.trim();
    final text = type == 'arrive'
        ? 'Arrive at your destination'
        : '${modifier.isEmpty ? type : '$type $modifier'}${road.isEmpty ? '' : ' onto $road'}';
    return NavigationProgress(
      best,
      math.max(0, total - progress),
      math.max(0, boundary - progress),
      text,
    );
  }
}
