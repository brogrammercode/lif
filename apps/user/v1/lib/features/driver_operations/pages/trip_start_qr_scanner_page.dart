import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:user/components/ui/solid_ui.dart';

class TripStartQrScannerPage extends StatefulWidget {
  const TripStartQrScannerPage({super.key});

  static Future<String?> scan(BuildContext context) =>
      Navigator.of(context).push<String>(
        MaterialPageRoute(builder: (_) => const TripStartQrScannerPage()),
      );

  @override
  State<TripStartQrScannerPage> createState() => _TripStartQrScannerPageState();
}

class _TripStartQrScannerPageState extends State<TripStartQrScannerPage> {
  late final MobileScannerController _scanner = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool _handled = false;

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value == null || !RegExp(r'^\d{6}$').hasMatch(value)) continue;
      _handled = true;
      Navigator.of(context).pop(value);
      return;
    }
  }

  @override
  void dispose() {
    _scanner.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SolidScope(
    child: Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: RideTokens.ink,
        title: const Text('Scan rider QR code'),
        centerTitle: true,
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _scanner, onDetect: _onDetect),
          IgnorePointer(
            child: Center(
              child: Container(
                width: 250,
                height: 250,
                decoration: BoxDecoration(
                  border: Border.all(color: RideTokens.accent, width: 3),
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 32,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: .75),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                'Align the rider’s QR code inside the frame to verify and start the trip.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 14),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
