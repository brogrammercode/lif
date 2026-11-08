import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/partner_program/partner_draft_store.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PartnerProgramController extends FeatureController {
  PartnerProgramController(this.repository);
  final PartnerProgramRepository repository;
  final Map<String, dynamic> values = {};
  final Map<String, List<PartnerLocalFile>> files = {};
  PartnerDraftStore? draftStore;
  String? uploadProgress;
  Map<String, dynamic>? workflow;
  bool loading = true;
  bool saving = false;
  String? error;
  String? pendingPickerFieldId;
  String? pendingPickerMode;
  String? pendingPickerStage;
  String? pendingPickerStartedAt;
  bool acceptPolicy = false;
  bool acceptConfirmation = false;
  bool dirty = false;
  bool submissionCommitted = false;
  bool needsSignIn = false;
  int loadRequest = 0;
  String stepKey = 'contact';

  void validateWorkflow(Map<String, dynamic> data) {
    const message =
        'Partner requirements could not be read. Refresh to try again.';
    bool object(dynamic item) =>
        item is Map && item.keys.every((key) => key is String);
    for (final key in ['requirements', 'assets']) {
      if (data[key] is! List ||
          (data[key] as List).any((item) => !object(item))) {
        throw const FormatException(message);
      }
    }
    final app = data['application'];
    if (app != null &&
        (app is! Map<String, dynamic> ||
            app['fields'] is! List ||
            (app['fields'] as List).any((item) => !object(item)))) {
      throw const FormatException(message);
    }
    final seen = <String>{};
    for (final field in _maps(data['requirements'])) {
      final id = field['id'];
      if (id is! String ||
          id.isEmpty ||
          !seen.add(id) ||
          field['label'] is! String ||
          ![
            'STRING',
            'TEXT',
            'NUMBER',
            'DATE',
            'BOOLEAN',
            'FILE',
            'IMAGE',
            'PDF',
          ].contains(field['field_type'])) {
        throw const FormatException(message);
      }
      final options = field['options'];
      if (options != null &&
          (options is! List ||
              options.any((v) => v is! String) ||
              options.toSet().length != options.length)) {
        throw const FormatException(message);
      }
    }
    for (final answer in _maps(_map(app)?['fields'])) {
      final field = _maps(
        data['requirements'],
      ).where((d) => d['id'] == answer['requirement_id']).firstOrNull;
      if (field != null &&
          ['FILE', 'IMAGE', 'PDF'].contains(field['field_type']) &&
          answer['value'] != null &&
          (answer['value'] is! List ||
              (answer['value'] as List).any((id) => id is! String))) {
        throw const FormatException(message);
      }
    }
  }

  List<Map<String, dynamic>> _maps(dynamic value) => (value as List? ?? [])
      .map((item) => Map<String, dynamic>.from(item as Map))
      .toList();
  Map<String, dynamic>? _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : null;
  Future<Map<String, dynamic>> fetchWorkflow() async {
    final data = await repository.workflow();
    validateWorkflow(data);
    return data;
  }
}
