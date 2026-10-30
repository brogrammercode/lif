import 'package:user/components/ui/liquid_glass.dart';
import 'dart:io';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/rides/ride_display.dart';

class VehicleDocumentSelection {
  final String name;
  final Uint8List bytes;
  const VehicleDocumentSelection(this.name, this.bytes);
}

class DriverDocumentsPage extends StatefulWidget {
  final bool readOnly;
  final VehicleVerificationRepository? repository;
  final Future<VehicleDocumentSelection?> Function(bool imagesOnly)?
  selectDocument;
  const DriverDocumentsPage({
    super.key,
    this.readOnly = false,
    this.repository,
    this.selectDocument,
  });
  @override
  State<DriverDocumentsPage> createState() => _DocumentsState();
}

class _DocumentsState extends State<DriverDocumentsPage> {
  late final repo = widget.repository ?? VehicleVerificationRepository();
  late Future<Map<String, dynamic>> _data = repo.documents();
  bool _busy = false;
  Future<void> _reload() async {
    if (!mounted) return;
    setState(() {
      _data = repo.documents();
    });
    try {
      await _data;
    } catch (_) {}
  }

  Future<void> _open(Map<String, dynamic> asset) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final bytes = await repo.image('${asset['id']}');
      if (!mounted) return;
      await VehicleVerificationRepository.openDocument(
        '${asset['file_name']}',
        bytes,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _renew(
    Map<String, dynamic> vehicle,
    Map<String, dynamic> field,
  ) async {
    if (_busy) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Replace reviewed document?'),
        content: const Text(
          'Driving with this vehicle will pause until the replacement is approved. Finish any active trip first.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Choose replacement'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final key = '${field['key']}';
      final selected = await (widget.selectDocument ?? _select)(
        ['front_image', 'back_image'].contains(key),
      );
      if (selected == null || !mounted) return;
      final bytes = selected.bytes;
      VehicleVerificationRepository.documentPayload(key, selected.name, bytes);
      final pdf =
          bytes.length >= 5 && String.fromCharCodes(bytes.take(5)) == '%PDF-';
      final submit = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Review replacement'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(selected.name),
                Text(
                  '${(bytes.length / 1024).ceil()} KB. The current document remains until you submit. This vehicle will then need approval.',
                ),
                if (!pdf)
                  Image.memory(
                    bytes,
                    height: 180,
                    fit: BoxFit.contain,
                    errorBuilder: (_, error, stack) => const Text(
                      'Image preview unavailable. Choose a valid image.',
                    ),
                  ),
                if (pdf)
                  OutlinedButton(
                    onPressed: () async {
                      try {
                        await VehicleVerificationRepository.openDocument(
                          selected.name,
                          bytes,
                        );
                      } catch (e) {
                        if (c.mounted) {
                          ScaffoldMessenger.of(c).showSnackBar(
                            SnackBar(content: Text(ApiResult.errorMessage(e))),
                          );
                        }
                      }
                    },
                    child: const Text('Preview PDF'),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Submit replacement'),
            ),
          ],
        ),
      );
      if (submit != true || !mounted) return;
      final asset = await repo.upload(key, selected.name, bytes);
      if (!mounted) return;
      await repo.renewDocument(
        '${vehicle['id']}',
        vehicle['verification_version'] as int,
        key,
        '${asset['id']}',
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Replacement is awaiting review. Other approved fields are preserved.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _reload();
      }
    }
  }

  Future<VehicleDocumentSelection?> _select(bool imagesOnly) async {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', if (!imagesOnly) 'pdf'],
    );
    if (file == null || !mounted) return null;
    if (file.path == null) throw StateError('This file could not be read.');
    final source = File(file.path!);
    if (await source.length() > 3000000) {
      throw StateError('Choose a file up to 3 MB.');
    }
    final bytes = await source.readAsBytes();
    return VehicleDocumentSelection(file.name, bytes);
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AppPage(
      glass: true,
      title: 'Vehicle documents',
      action: IconButton(
        tooltip: 'Refresh documents',
        onPressed: _busy ? null : _reload,
        icon: const Icon(Icons.refresh),
      ),
      child: FutureBuilder<Map<String, dynamic>>(
        future: _data,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return AppLoadError(
              message: ApiResult.errorMessage(snapshot.error!),
              onRetry: _reload,
            );
          }
          if (!snapshot.hasData) {
            return const LiquidGlassFormSkeleton();
          }
          final vehicles = rideMaps(snapshot.data!['vehicles']);
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const Text(
                  'Documents are private to you and authorized reviewers. Replacements are reviewed manually. Vehicle front/back use images; RC, insurance and PUC may use images or PDF.',
                ),
                if (!widget.readOnly)
                  OutlinedButton(
                    onPressed: () =>
                        Navigator.pushNamed(
                          context,
                          AppRoutes.driverVehicles,
                        ).then((_) {
                          if (mounted) _reload();
                        }),
                    child: const Text('Manage or register vehicles'),
                  ),
                if (vehicles.isEmpty) const Text('No vehicle documents yet.'),
                for (final vehicle in vehicles)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            '${vehicle['make']} ${vehicle['model']} - ${vehicle['plate_number']}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          ),
                          Text('${vehicle['status']}'),
                          for (final field in rideMaps(
                            vehicle['verification_fields'],
                          )) ...[
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              title: Text('${field['label']}'),
                              subtitle: Text(
                                '${field['status']}${field['rejection_reason'] == null ? '' : ' - ${field['rejection_reason']}'}',
                              ),
                            ),
                            for (final asset in rideMaps(
                              vehicle['verification_assets'],
                            ).where((a) => a['id'] == field['value']))
                              Wrap(
                                spacing: 8,
                                children: [
                                  OutlinedButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _open(asset),
                                    icon: const Icon(
                                      Icons.description_outlined,
                                    ),
                                    label: const Text('Open document'),
                                  ),
                                  if (!widget.readOnly &&
                                      field['status'] == 'APPROVED')
                                    TextButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _renew(vehicle, field),
                                      child: const Text('Replace for review'),
                                    ),
                                ],
                              ),
                          ],
                        ],
                      ),
                    ),
                  ),
                if (_busy) const LinearProgressIndicator(),
              ],
            ),
          );
        },
      ),
    ),
  );
}
