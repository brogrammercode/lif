import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';

class SolidUploadFile {
  final String name;
  final Uint8List? bytes;
  final String? path;
  final String? imageUrl;
  final String? id;
  final Future<Uint8List?> Function()? loadBytes;
  final VoidCallback? onOpen;
  final VoidCallback? onRemove;

  const SolidUploadFile({
    required this.name,
    this.bytes,
    this.path,
    this.imageUrl,
    this.id,
    this.loadBytes,
    this.onOpen,
    this.onRemove,
  });
}

/// Shared solid file/image picker for rider and driver account forms.
class SolidFileUpload extends StatelessWidget {
  static const double selectedImageHeight = 228;
  static const double compactSelectedImageHeight = selectedImageHeight;

  static ResizeImage previewImage(Uint8List bytes) => ResizeImage(
    MemoryImage(bytes),
    width: 720,
    height: 540,
    policy: ResizeImagePolicy.fit,
  );

  static ImageProvider previewFile(String path) => ResizeImage(
    FileImage(File(path)),
    width: 720,
    height: 540,
    policy: ResizeImagePolicy.fit,
  );

  final List<SolidUploadFile> files;
  final bool image;
  final bool camera;
  final bool busy;
  final VoidCallback? onChoose;
  final String limitText;
  final bool compact;
  final String? label;
  final bool showGuidance;
  final bool allowAdditional;

  const SolidFileUpload({
    super.key,
    required this.files,
    required this.image,
    required this.camera,
    required this.busy,
    required this.onChoose,
    required this.limitText,
    this.compact = false,
    this.label,
    this.showGuidance = true,
    this.allowAdditional = false,
  });

  @override
  Widget build(BuildContext context) {
    if (files.isEmpty) {
      return _UploadDropZone(
        camera: camera,
        busy: busy,
        onChoose: onChoose,
        guidance: showGuidance ? limitText : null,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final file in files)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _SelectedUpload(
              file: file,
              image: image && !_isPdf(file.name),
              busy: busy,
            ),
          ),
        if (allowAdditional && onChoose != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: busy ? null : onChoose,
              icon: const Icon(Icons.add_rounded, size: 19),
              label: Text(camera ? 'Add another photo' : 'Add another file'),
              style: TextButton.styleFrom(
                foregroundColor: RideTokens.ink,
                textStyle: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ),
          ),
      ],
    );
  }

  static bool _isPdf(String name) => name.toLowerCase().endsWith('.pdf');
}

class _UploadDropZone extends StatelessWidget {
  final bool camera, busy;
  final VoidCallback? onChoose;
  final String? guidance;
  const _UploadDropZone({
    required this.camera,
    required this.busy,
    required this.onChoose,
    required this.guidance,
  });

  @override
  Widget build(BuildContext context) => CustomPaint(
    foregroundPainter: const _DashedRoundedBorder(),
    child: Material(
      color: const Color(0xFFFAFBF9),
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: busy ? null : onChoose,
        child: LayoutBuilder(
          builder: (context, constraints) => SizedBox(
            width: double.infinity,
            height: (constraints.maxWidth / 2.1).clamp(164.0, 240.0),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  camera
                      ? const Icon(
                          Icons.add_a_photo_outlined,
                          size: 36,
                          color: Color(0xFF6F777B),
                        )
                      : const _StackedUploadMark(),
                  const SizedBox(height: 12),
                  Text(
                    busy
                        ? 'Preparing file…'
                        : camera
                        ? 'Take or select a photo'
                        : 'Drag and drop or select files',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 15,
                      height: 1.15,
                      fontWeight: FontWeight.w400,
                      color: RideTokens.ink,
                    ),
                  ),
                  if (guidance != null && guidance!.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      guidance!,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.2,
                        color: Color(0xFF62686B),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _StackedUploadMark extends StatelessWidget {
  const _StackedUploadMark();
  @override
  Widget build(BuildContext context) => const SizedBox(
    width: 44,
    height: 44,
    child: Icon(Icons.upload_file_outlined, size: 42, color: Color(0xFF687175)),
  );
}

class _SelectedUpload extends StatefulWidget {
  final SolidUploadFile file;
  final bool image, busy;
  const _SelectedUpload({
    required this.file,
    required this.image,
    required this.busy,
  });

  @override
  State<_SelectedUpload> createState() => _SelectedUploadState();
}

class _SelectedUploadState extends State<_SelectedUpload> {
  Future<Uint8List?>? _bytes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _SelectedUpload oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.file.id != widget.file.id ||
        oldWidget.file.name != widget.file.name ||
        oldWidget.file.path != widget.file.path ||
        oldWidget.file.imageUrl != widget.file.imageUrl ||
        !identical(oldWidget.file.bytes, widget.file.bytes)) {
      _load();
    }
  }

  void _load() {
    _bytes = widget.file.bytes != null
        ? Future.value(widget.file.bytes)
        : widget.file.path != null
        ? File(widget.file.path!).readAsBytes()
        : widget.file.loadBytes?.call();
  }

  Widget _image(Uint8List bytes) => Image(
    image: SolidFileUpload.previewImage(bytes),
    width: double.infinity,
    height: SolidFileUpload.selectedImageHeight,
    fit: BoxFit.cover,
    errorBuilder: (_, _, _) => _FilePreviewFallback(name: widget.file.name),
  );

  @override
  Widget build(BuildContext context) {
    final file = widget.file;
    final canPreview =
        widget.image &&
        (file.bytes != null ||
            file.path != null ||
            file.imageUrl != null ||
            file.loadBytes != null);
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: SolidFileUpload.selectedImageHeight,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Material(
              color: const Color(0xFFF3F4F3),
              child: InkWell(
                onTap: widget.busy ? null : file.onOpen,
                child: file.imageUrl != null
                    ? Image.network(
                        file.imageUrl!,
                        width: double.infinity,
                        height: SolidFileUpload.selectedImageHeight,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            _FilePreviewFallback(name: file.name),
                      )
                    : canPreview
                    ? FutureBuilder<Uint8List?>(
                        future: _bytes,
                        builder: (context, snapshot) => snapshot.hasData
                            ? _image(snapshot.data!)
                            : snapshot.hasError ||
                                  snapshot.connectionState ==
                                      ConnectionState.done
                            ? _FilePreviewFallback(name: file.name)
                            : const Center(
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                      )
                    : _FilePreviewFallback(name: file.name),
              ),
            ),
            if (file.onRemove != null)
              Positioned(
                top: 10,
                right: 10,
                child: Material(
                  color: Colors.white,
                  shape: const CircleBorder(),
                  elevation: 1,
                  child: IconButton(
                    tooltip: 'Remove file',
                    onPressed: widget.busy ? null : file.onRemove,
                    constraints: const BoxConstraints.tightFor(
                      width: 30,
                      height: 30,
                    ),
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.close_rounded, size: 16),
                  ),
                ),
              ),
            if (widget.busy)
              const ColoredBox(
                color: Color(0x55000000),
                child: Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _FilePreviewFallback extends StatelessWidget {
  final String name;
  const _FilePreviewFallback({required this.name});
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(
          Icons.description_outlined,
          size: 42,
          color: RideTokens.muted,
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 48),
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, color: RideTokens.ink),
          ),
        ),
      ],
    ),
  );
}

class _DashedRoundedBorder extends CustomPainter {
  const _DashedRoundedBorder();

  @override
  void paint(Canvas canvas, Size size) {
    const radius = Radius.circular(16);
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(.5, .5, size.width - 1, size.height - 1),
          radius,
        ),
      );
    final paint = Paint()
      ..color = const Color(0xFFD8DDD9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final metric in path.computeMetrics()) {
      for (var distance = 0.0; distance < metric.length; distance += 8) {
        final end = (distance + 4).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, end), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRoundedBorder oldDelegate) => false;
}
