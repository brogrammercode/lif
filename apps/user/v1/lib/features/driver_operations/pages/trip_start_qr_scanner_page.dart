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
  Widget build(BuildContext context) => SolidPage(
    title: 'Scan rider QR code',
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      child: Column(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: LayoutBuilder(
                builder: (context, bounds) {
                  final size = bounds.biggest.shortestSide * .72;
                  final frame = Rect.fromCenter(
                    center: bounds.biggest.center(Offset.zero),
                    width: size,
                    height: size,
                  );
                  return Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _scanner,
                        onDetect: _onDetect,
                        scanWindow: frame,
                        errorBuilder: (_, _) => const ColoredBox(
                          color: Colors.black,
                          child: Center(
                            child: Text(
                              'Camera unavailable. Use the trip code to start.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white),
                            ),
                          ),
                        ),
                      ),
                      ValueListenableBuilder<MobileScannerState>(
                        valueListenable: _scanner,
                        builder: (_, state, _) => state.isRunning
                            ? IgnorePointer(
                                child: Center(
                                  child: Container(
                                    width: size,
                                    height: size,
                                    decoration: BoxDecoration(
                                      border: Border.all(
                                        color: Colors.white,
                                        width: 2,
                                      ),
                                      borderRadius: BorderRadius.circular(18),
                                    ),
                                  ),
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Place the rider’s QR code inside the frame to verify the pickup.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: RideTokens.ink),
          ),
        ],
      ),
    ),
  );
}
