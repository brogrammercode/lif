import 'dart:ui' as ui;

import 'package:flutter/services.dart';

/// Shared pin artwork for pickup/drop-off coordinates across ride maps.
class RideMapPinAssets {
  RideMapPinAssets._();

  static const assetPath = 'assets/images/ride_map_pin.png';
  static const pickupFilter = ui.ColorFilter.matrix([
    .08,
    .92,
    0,
    0,
    0,
    .92,
    .08,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ]);

  static Future<Uint8List>? _redBytes;
  static Future<Uint8List>? _greenBytes;

  static Future<Uint8List> red() => _redBytes ??= _loadRed();
  static Future<Uint8List> green() => _greenBytes ??= _loadGreen();

  static Future<Uint8List> _loadRed() async {
    final data = await rootBundle.load(assetPath);
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  }

  static Future<Uint8List> _loadGreen() async {
    final sourceBytes = await _loadRed();
    final codec = await ui.instantiateImageCodec(sourceBytes);
    try {
      final frame = await codec.getNextFrame();
      final source = frame.image;
      try {
        final recorder = ui.PictureRecorder();
        final canvas = ui.Canvas(recorder);
        canvas.drawImage(
          source,
          ui.Offset.zero,
          ui.Paint()..colorFilter = pickupFilter,
        );
        final picture = recorder.endRecording();
        try {
          final tinted = await picture.toImage(source.width, source.height);
          try {
            final data = await tinted.toByteData(
              format: ui.ImageByteFormat.png,
            );
            if (data == null) {
              throw StateError('Could not prepare the green pickup pin.');
            }
            return data.buffer.asUint8List(
              data.offsetInBytes,
              data.lengthInBytes,
            );
          } finally {
            tinted.dispose();
          }
        } finally {
          picture.dispose();
        }
      } finally {
        source.dispose();
      }
    } finally {
      codec.dispose();
    }
  }
}
