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
  const PartnerUploadTile({
    super.key,
    required this.files,
    required this.image,
    required this.camera,
    required this.busy,
    required this.onChoose,
    required this.limitText,
  });
  @override
  Widget build(BuildContext context) => Column(
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
                    child: Text(file.name, overflow: TextOverflow.ellipsis),
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
              camera ? Icons.photo_camera_outlined : Icons.upload_file_outlined,
            ),
            label: Text(
              busy
                  ? 'Please wait…'
                  : camera
                  ? (files.isEmpty ? 'Take live selfie' : 'Retake selfie')
                  : (files.isEmpty ? 'Choose files' : 'Add / replace files'),
            ),
          ),
        ),
      const SizedBox(height: 8),
      Text(
        limitText,
        style: const TextStyle(fontSize: 11, color: GlassTokens.muted),
      ),
    ],
  );
}
