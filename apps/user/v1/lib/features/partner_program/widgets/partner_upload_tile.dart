import 'dart:typed_data';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:user/core/color.dart';
import 'package:user/components/ui/liquid_glass.dart';

class PartnerUploadFile {
  final String name;
  final Uint8List? bytes;
  final String? path;
  final VoidCallback? onOpen;
  final VoidCallback? onRemove;
  const PartnerUploadFile({
    required this.name,
    this.bytes,
    this.path,
    this.onOpen,
    this.onRemove,
  });
}

/// Shared document/selfie layout. Limit decoded pixels as well as file bytes;
/// a small compressed image can otherwise exhaust memory during preview.
class PartnerUploadTile extends StatelessWidget {
  static ResizeImage previewImage(Uint8List bytes) => ResizeImage(
    MemoryImage(bytes),
    width: 320,
    height: 320,
    policy: ResizeImagePolicy.fit,
  );
  static ImageProvider previewFile(String path) => ResizeImage(
    FileImage(File(path)),
    width: 320,
    height: 320,
    policy: ResizeImagePolicy.fit,
  );
  final List<PartnerUploadFile> files;
  final bool image;
  final bool camera;
  final bool busy;
  final VoidCallback? onChoose;
  final String limitText;
  final bool compact;
  final String? label;
  final bool showGuidance;
  const PartnerUploadTile({
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
  });

  String get _choiceText => busy
      ? 'Please wait\u2026'
      : camera
      ? (files.isEmpty ? 'Take live selfie' : 'Retake selfie')
      : (files.isEmpty ? 'Choose files' : 'Add / replace files');

  Future<void> _reviewFiles(BuildContext context) async {
    final remaining = List<PartnerUploadFile>.from(files);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => LiquidGlassSheet(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * .8,
            ),
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                20,
                8,
                20,
                20 + MediaQuery.paddingOf(context).bottom,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label ?? 'Selected files',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  if (remaining.isEmpty) const Text('No files selected.'),
                  PartnerUploadTile(
                    files: remaining
                        .map(
                          (file) => PartnerUploadFile(
                            name: file.name,
                            path: file.path,
                            bytes: file.bytes,
                            onOpen: file.onOpen,
                            onRemove: file.onRemove == null
                                ? null
                                : () {
                                    file.onRemove!();
                                    update(() => remaining.remove(file));
                                  },
                          ),
                        )
                        .toList(),
                    image: image,
                    camera: camera,
                    busy: false,
                    onChoose: null,
                    limitText: limitText,
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _compact(BuildContext context) {
    final first = files.firstOrNull;
    final hasPreview =
        image && first != null && (first.path != null || first.bytes != null);
    return LiquidGlassSurface(
      padding: const EdgeInsets.all(10),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            label: '${label ?? 'Upload'}: $_choiceText',
            child: InkWell(
              onTap: busy ? null : onChoose,
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  children: [
                    Stack(
                      alignment: Alignment.topRight,
                      children: [
                        SizedBox(
                          height: hasPreview ? 72 : 48,
                          width: double.infinity,
                          child: hasPreview && !busy
                              ? ClipRRect(
                                  borderRadius: BorderRadius.circular(14),
                                  child: Image(
                                    image: first.path != null
                                        ? previewFile(first.path!)
                                        : previewImage(first.bytes!),
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, error, stack) =>
                                        const Icon(
                                          Icons.image_outlined,
                                          size: 28,
                                        ),
                                  ),
                                )
                              : Icon(
                                  camera
                                      ? Icons.photo_camera_outlined
                                      : image
                                      ? Icons.image_outlined
                                      : Icons.description_outlined,
                                  size: 28,
                                  color: GlassTokens.ink,
                                ),
                        ),
                        if (onChoose != null)
                          const Icon(
                            Icons.add_circle_outline,
                            size: 20,
                            color: GlassTokens.accent,
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      label ?? (camera ? 'Live selfie' : 'Document'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: GlassTokens.ink,
                      ),
                    ),
                    if (showGuidance) ...[
                      const SizedBox(height: 5),
                      Text(
                        limitText,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 11,
                          color: GlassTokens.muted,
                        ),
                      ),
                    ],
                    if (onChoose != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _choiceText,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: GlassTokens.accent,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          if (files.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              first!.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, color: GlassTokens.muted),
            ),
            TextButton(
              style: TextButton.styleFrom(
                minimumSize: const Size(48, 48),
                padding: const EdgeInsets.symmetric(vertical: 8),
              ),
              onPressed: busy ? null : () => _reviewFiles(context),
              child: Text(
                'Review files (${files.length})',
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => compact
      ? _compact(context)
      : Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ...files.map(
              (file) => LiquidGlassSurface(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                radius: 20,
                child: Column(
                  children: [
                    if (image && (file.path != null || file.bytes != null))
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: SizedBox(
                          height: 160,
                          width: double.infinity,
                          child: busy
                              ? const Center(child: Icon(Icons.image_outlined))
                              : Image(
                                  image: file.path != null
                                      ? previewFile(file.path!)
                                      : previewImage(file.bytes!),
                                  height: 160,
                                  width: double.infinity,
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, error, stack) => const Padding(
                                    padding: EdgeInsets.all(20),
                                    child: Text(
                                      'Preview unavailable. Retake or replace this image.',
                                    ),
                                  ),
                                ),
                        ),
                      ),
                    Row(
                      children: [
                        Icon(
                          camera
                              ? Icons.face_outlined
                              : image
                              ? Icons.image_outlined
                              : Icons.description_outlined,
                          color: AppColors.primaryGreen,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            file.name,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (file.onOpen != null)
                          IconButton(
                            tooltip: 'Open file',
                            onPressed: busy ? null : file.onOpen,
                            icon: const Icon(Icons.visibility_outlined),
                          ),
                        if (file.onRemove != null)
                          IconButton(
                            tooltip: 'Remove file',
                            onPressed: busy ? null : file.onRemove,
                            icon: const Icon(Icons.close),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (onChoose != null)
              LiquidGlassSurface(
                padding: EdgeInsets.zero,
                radius: 22,
                child: OutlinedButton.icon(
                  onPressed: busy ? null : onChoose,
                  icon: Icon(
                    camera
                        ? Icons.photo_camera_outlined
                        : Icons.upload_file_outlined,
                  ),
                  label: Text(
                    busy
                        ? 'Please wait…'
                        : camera
                        ? (files.isEmpty ? 'Take live selfie' : 'Retake selfie')
                        : (files.isEmpty
                              ? 'Choose files'
                              : 'Add / replace files'),
                  ),
                ),
              ),
            if (showGuidance) ...[
              const SizedBox(height: 8),
              Text(
                limitText,
                style: const TextStyle(fontSize: 11, color: GlassTokens.muted),
              ),
            ],
          ],
        );
}
