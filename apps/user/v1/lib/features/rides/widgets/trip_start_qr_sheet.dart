import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:user/components/ui/solid_ui.dart';

class TripStartQrSheet extends StatelessWidget {
  final String code;

  const TripStartQrSheet({super.key, required this.code});

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.sizeOf(context);
    final qrSize = math
        .min(math.min(screen.width - 88, screen.height - 160), 300.0)
        .clamp(100.0, 300.0)
        .toDouble();

    return SolidSurface(
      fullRadius: false,
      blackHeight: 54,
      radius: 18,
      upperChild: const Row(
        children: [
          Icon(Icons.qr_code_2_rounded, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text('Trip QR code', style: TextStyle(color: Colors.white)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Align(
          heightFactor: 1,
          child: QrImageView(
            data: code,
            version: QrVersions.auto,
            size: qrSize,
            backgroundColor: Colors.white,
            errorCorrectionLevel: QrErrorCorrectLevel.H,
            padding: const EdgeInsets.all(12),
          ),
        ),
      ),
    );
  }
}
