import 'dart:typed_data';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';

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
  static const double compactSelectedImageHeight = 184;
  static const double selectedImageHeight = 236;

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
        builder: (context, update) => SolidSheet(
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
    return SolidSurface(
      padding: const EdgeInsets.all(12),
      radius: 14,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            image: hasPreview,
            label: hasPreview
                ? 'Selected ${label ?? 'image'} preview'
                : '${label ?? 'Upload'}: $_choiceText',
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: RideTokens.line),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  height: hasPreview ? compactSelectedImageHeight : 84,
                  width: double.infinity,
                  child: hasPreview && !busy
                      ? Image(
                          image: first.path != null
                              ? previewFile(first.path!)
                              : previewImage(first.bytes!),
                          fit: BoxFit.cover,
                          errorBuilder: (_, error, stack) => Container(
                            color: const Color(0xFFF5F5F5),
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.image_outlined,
                              size: 30,
                              color: RideTokens.muted,
                            ),
                          ),
                        )
                      : Material(
                          color: const Color(0xFFF5F5F5),
                          child: InkWell(
                            onTap: busy ? null : onChoose,
                            child: Center(
                              child: Icon(
                                camera
                                    ? Icons.photo_camera_outlined
                                    : image
                                    ? Icons.image_outlined
                                    : Icons.description_outlined,
                                size: 30,
                                color: RideTokens.muted,
                              ),
                            ),
                          ),
                        ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            label ?? (camera ? 'Live selfie' : 'Document'),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: RideTokens.ink,
            ),
          ),
          if (showGuidance) ...[
            const SizedBox(height: 4),
            Text(
              limitText,
              style: const TextStyle(fontSize: 11, color: RideTokens.muted),
            ),
          ],
          if (files.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              first!.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: RideTokens.muted),
            ),
          ],
          if (onChoose != null) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: busy ? null : onChoose,
              icon: Icon(
                busy
                    ? Icons.hourglass_top_rounded
                    : camera
                    ? Icons.photo_camera_outlined
                    : Icons.upload_file_outlined,
                size: 18,
              ),
              label: Text(_choiceText),
              style: OutlinedButton.styleFrom(
                foregroundColor: RideTokens.ink,
                minimumSize: const Size(0, 44),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                side: const BorderSide(color: RideTokens.line),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
          if (files.isNotEmpty) ...[
            const SizedBox(height: 2),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, 40),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                ),
                onPressed: busy ? null : () => _reviewFiles(context),
                child: Text('Review files (${files.length})'),
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
              (file) => SolidSurface(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                radius: 14,
                child: Column(
                  children: [
                    if (image && (file.path != null || file.bytes != null))
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          height: selectedImageHeight,
                          width: double.infinity,
                          child: busy
                              ? const Center(child: Icon(Icons.image_outlined))
                              : Image(
                                  image: file.path != null
                                      ? previewFile(file.path!)
                                      : previewImage(file.bytes!),
                                  height: selectedImageHeight,
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
                          color: RideTokens.accent,
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
              SolidSurface(
                padding: EdgeInsets.zero,
                radius: 14,
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
                  style: OutlinedButton.styleFrom(
                    foregroundColor: RideTokens.ink,
                    minimumSize: const Size(0, 44),
                    side: const BorderSide(color: RideTokens.line),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            if (showGuidance) ...[
              const SizedBox(height: 8),
              Text(
                limitText,
                style: const TextStyle(fontSize: 11, color: RideTokens.muted),
              ),
            ],
          ],
        );
}
