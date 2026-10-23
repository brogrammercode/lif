import 'dart:convert';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

Map<String, dynamic> decodeVehicleDraft(String source) {
  final raw = jsonDecode(source);
  if (raw is! Map<String, dynamic> ||
      raw['version'] is! int ||
      raw['registration_key'] is! String ||
      !RegExp(
        r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
      ).hasMatch(raw['registration_key'] as String)) {
    throw const FormatException('Invalid vehicle draft');
  }
  for (final key in ['brand', 'model']) {
    final value = raw[key];
    if (value != null &&
        (value is! Map<String, dynamic> ||
            value['id'] is! String ||
            value['name'] is! String ||
            (key == 'model' &&
                (value['vehicle_type'] is! String ||
                    value['seating_capacity'] is! num)))) {
      throw const FormatException('Invalid catalog choice in vehicle draft');
    }
  }
  for (final key in ['documents', 'paths', 'names']) {
    final value = raw[key];
    if (value is! Map ||
        value.entries.any(
          (e) => !vehicleDocuments.containsKey(e.key) || e.value is! String,
        )) {
      throw const FormatException('Invalid images in vehicle draft');
    }
  }
  for (final key in ['plate', 'color']) {
    if (raw[key] is! String) {
      throw const FormatException('Invalid vehicle details in draft');
    }
  }
  final obsolete = raw['obsolete_uploads'];
  if (obsolete != null &&
      (obsolete is! List ||
          obsolete.length > 100 ||
          obsolete.any(
            (id) => id is! String || id.isEmpty || id.length > 100,
          ))) {
    throw const FormatException('Invalid unused uploads in draft');
  }
  if ((raw['category_id'] != null && raw['category_id'] is! String) ||
      (raw['pending_capture'] != null &&
          !vehicleDocuments.containsKey(raw['pending_capture']))) {
    throw const FormatException('Invalid vehicle draft');
  }
  return raw;
}

/// Start with the saved map itself: merging server fields would resurrect an
/// image the driver deliberately removed. Expired unsubmitted assets need upload again.
Map<String, String> reusableVehicleDocuments(
  Map<String, String> saved,
  List<Map<String, dynamic>> fields,
  List<Map<String, dynamic>> pending,
) => {
  for (final entry in saved.entries)
    if (vehicleDocuments.containsKey(entry.key) &&
        (fields.any(
              (field) =>
                  field['key'] == entry.key && field['value'] == entry.value,
            ) ||
            pending.any(
              (asset) =>
                  asset['field_key'] == entry.key && asset['id'] == entry.value,
            )))
      entry.key: entry.value,
  for (final field in fields)
    if (field['status'] == 'APPROVED' &&
        vehicleDocuments.containsKey(field['key']) &&
        field['value'] is String)
      field['key'] as String: field['value'] as String,
};
