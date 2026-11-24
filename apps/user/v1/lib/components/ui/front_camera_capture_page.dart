import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

Future<XFile?> showFrontCameraCapture(BuildContext context) =>
    Navigator.of(context).push<XFile?>(
      MaterialPageRoute<XFile?>(builder: (_) => const FrontCameraCapturePage()),
    );

/// Dedicated selfie capture. It opens only a front-facing camera and provides
/// no lens-switch control or rear-camera fallback.
class FrontCameraCapturePage extends StatefulWidget {
  const FrontCameraCapturePage({super.key});

  @override
  State<FrontCameraCapturePage> createState() => _FrontCameraCapturePageState();
}

class _FrontCameraCapturePageState extends State<FrontCameraCapturePage>
    with WidgetsBindingObserver {
  CameraController? _camera;
  final Map<CameraController, Future<void>> _cameraDisposals = {};
  Object? _error;
  bool _takingPicture = false;
  bool _initializing = false;
  bool _resumeRequested = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initializeCamera());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Keep the camera alive while the OS permission prompt is in front. On
    // Android that prompt can report `inactive`; disposing during initialize
    // cancels the permission handoff and makes a granted request look denied.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _generation++;
      final camera = _camera;
      _camera = null;
      if (camera != null) unawaited(_disposeCamera(camera));
    } else if (state == AppLifecycleState.resumed) {
      if (_initializing) {
        _resumeRequested = true;
      } else if (_camera == null) {
        unawaited(_initializeCamera());
      }
    }
  }

  Future<void> _initializeCamera() async {
    if (!mounted || _initializing) return;
    _initializing = true;
    _resumeRequested = false;
    final generation = ++_generation;
    setState(() => _error = null);
    CameraController? camera;
    try {
      final cameras = await availableCameras();
      final frontCamera = cameras
          .where((item) => item.lensDirection == CameraLensDirection.front)
          .firstOrNull;
      if (frontCamera == null) {
        throw CameraException(
          'FrontCameraUnavailable',
          'This device does not have a front-facing camera.',
        );
      }

      camera = CameraController(
        frontCamera,
        ResolutionPreset.medium,
        enableAudio: false,
      );
      _camera = camera;
      await camera.initialize();
      if (!mounted || generation != _generation) {
        await _disposeCamera(camera);
        return;
      }
      setState(() {});
    } catch (error) {
      debugPrint('FrontCameraCapture initialize_error=$error');
      if (mounted && generation == _generation) {
        _camera = null;
        setState(() => _error = error);
      }
      if (camera != null) await _disposeCamera(camera);
    } finally {
      _initializing = false;
      if (_resumeRequested && mounted && _camera == null) {
        _resumeRequested = false;
        unawaited(_initializeCamera());
      }
    }
  }

  Future<void> _takePicture() async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized || _takingPicture) return;
    setState(() => _takingPicture = true);
    try {
      final image = await camera.takePicture();
      if (mounted) Navigator.of(context).pop(image);
    } catch (error) {
      debugPrint('FrontCameraCapture capture_error=$error');
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _takingPicture = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _generation++;
    final camera = _camera;
    _camera = null;
    if (camera != null) unawaited(_disposeCamera(camera));
    super.dispose();
  }

  /// CameraX teardown can race with a lifecycle callback while initialize()
  /// is still completing. Reuse one disposal future per controller so a stale
  /// initialize completion cannot call CameraX's internal clear twice.
  Future<void> _disposeCamera(CameraController camera) {
    return _cameraDisposals.putIfAbsent(camera, () async {
      try {
        await camera.dispose();
      } catch (error) {
        // The platform may already have detached its Pigeon channel during
        // engine teardown. Cleanup must not escape as an unhandled exception.
        debugPrint('FrontCameraCapture dispose_error=$error');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final camera = _camera;
    final ready = camera?.value.isInitialized == true;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            SizedBox(
              height: 56,
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Cancel selfie',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                  const Expanded(
                    child: Text(
                      'Live selfie',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: SizedBox.expand(
                    child: ready
                        ? Center(child: CameraPreview(camera!))
                        : _cameraStatus(),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
              child: Row(
                children: [
                  const SizedBox(width: 56),
                  Expanded(
                    child: Text(
                      ready ? 'Front camera only' : 'Preparing front camera',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFD0D0D0),
                        fontSize: 13,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 56,
                    height: 56,
                    child: IconButton.filled(
                      tooltip: 'Take selfie',
                      onPressed: !ready || _takingPicture ? null : _takePicture,
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        disabledBackgroundColor: const Color(0xFF777777),
                      ),
                      icon: _takingPicture
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.black,
                              ),
                            )
                          : const Icon(Icons.camera_alt_rounded, size: 24),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cameraStatus() {
    final error = _error;
    if (error == null) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }
    final message = switch (error) {
      CameraException(code: 'FrontCameraUnavailable', :final description) =>
        description ?? 'A front-facing camera is unavailable.',
      CameraException(code: 'CameraAccessDenied') =>
        'Camera permission was denied. Allow camera access in Settings and try again.',
      CameraException(code: 'CameraAccessDeniedWithoutPrompt') =>
        'Camera access is blocked. Enable camera permission for 1More in Settings.',
      CameraException(code: 'CameraAccessRestricted') =>
        'Camera access is restricted on this device.',
      CameraException(:final code, :final description) =>
        'Could not open the front camera ($code). ${description ?? ''}'.trim(),
      _ => 'Could not open the front camera: $error',
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.no_photography_outlined,
              color: Colors.white70,
              size: 34,
            ),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: _initializing ? null : _initializeCamera,
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
