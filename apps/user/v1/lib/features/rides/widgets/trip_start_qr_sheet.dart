import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

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

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
      backgroundColor: Colors.white,
      child: SizedBox(
        width: qrSize + 40,
        height: qrSize + 40,
        child: Center(
          child: QrImageView(
            data: code,
            version: QrVersions.auto,
            size: qrSize,
            backgroundColor: Colors.white,
            errorCorrectionLevel: QrErrorCorrectLevel.H,
            padding: EdgeInsets.zero,
          ),
        ),
      ),
    );
  }
}
