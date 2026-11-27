import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  bool _manual = false;
  String _code = '';

  bool _submit(String? value) {
    if (_handled || value == null || !RegExp(r'^\d{6}$').hasMatch(value)) {
      return false;
    }
    _handled = true;
    Navigator.of(context).pop(value);
    return true;
  }

  void _onDetect(BarcodeCapture capture) {
    if (_manual || _handled) return;
    for (final barcode in capture.barcodes) {
      if (_submit(barcode.rawValue?.trim())) return;
    }
  }

  @override
  void dispose() {
    _scanner.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: _manual ? 'Enter trip code' : 'Scan rider QR code',
    child: _manual
        ? ListView(
            padding: const EdgeInsets.all(20),
            children: [
              SolidTextFormField(
                label: 'Six-digit code from rider',
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                onChanged: (value) => setState(() => _code = value),
                onFieldSubmitted: _submit,
              ),
              const SizedBox(height: 16),
              SolidButton(
                text: 'Verify trip code',
                minHeight: 54,
                onPressed: _code.length == 6 ? () => _submit(_code) : null,
              ),
            ],
          )
        : Padding(
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
                                            borderRadius: BorderRadius.circular(
                                              18,
                                            ),
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
                TextButton(
                  onPressed: () => setState(() => _manual = true),
                  child: const Text('Use trip code'),
                ),
              ],
            ),
          ),
  );
}
