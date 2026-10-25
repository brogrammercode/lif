/// Validates the entire draft, including fields disposed by the scrolling form.
/// FormState.validate alone only sees mounted fields on long applications.
String? validatePartnerDraft(
  List<Map<String, dynamic>> definitions,
  Map<String, dynamic> values, {
  required String email,
  required String phone,
}) {
  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email.trim())) {
    return 'Enter a valid contact email address.';
  }
  if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone.trim())) {
    return 'Include + and your country code in the WhatsApp number.';
  }
  for (final definition in definitions) {
    final id = '${definition['id']}';
    final label = '${definition['label']}';
    final value = values[id];
    final empty =
        value == null || value == '' || (value is List && value.isEmpty);
    if (empty) {
      if (definition['is_required'] == true) return '$label is required.';
      continue;
    }
    final type = definition['field_type'];
    final kind = definition['input_kind'];
    if (['FILE', 'IMAGE', 'PDF'].contains(type)) {
      if (value is! List ||
          value.length > (definition['allow_multiple'] == true ? 10 : 1)) {
        return 'Check the number of files for $label.';
      }
      continue;
    }
    if (type == 'BOOLEAN') {
      if (value is! bool) return 'Choose yes or no for $label.';
      continue;
    }
    final text = '$value'.trim();
    final maxLength = (definition['max_length'] as num?)?.toInt() ?? 10000;
    if (text.length > maxLength) {
      return '$label allows at most $maxLength characters.';
    }
    if (type == 'NUMBER') {
      final number = num.tryParse(text);
      if (number == null || !number.isFinite) {
        return 'Enter a valid number for $label.';
      }
      final min = definition['min_value'] as num?;
      final max = definition['max_value'] as num?;
      if (min != null && number < min) return '$label must be at least $min.';
      if (max != null && number > max) return '$label must be at most $max.';
    }
    if (type == 'DATE' || kind == 'DOB') {
      final date = DateTime.tryParse(text);
      final now = DateTime.now();
      if (date == null ||
          date.toIso8601String().substring(0, 10) != text ||
          (kind == 'DOB' &&
              (date.year < 1900 ||
                  date.isAfter(DateTime(now.year, now.month, now.day))))) {
        return 'Choose a valid ${kind == 'DOB' ? 'date of birth on or before today' : 'date'} for $label.';
      }
    }
    if (kind == 'IFSC' && !RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(text)) {
      return 'Enter a valid 11-character IFSC code for $label.';
    }
    if (kind == 'UPI' &&
        !RegExp(
          r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])$',
        ).hasMatch(text)) {
      return 'Enter a valid UPI ID for $label, for example name@bank.';
    }
    if (kind == 'GENDER' || kind == 'OWNERSHIP') {
      final options = definition['options'];
      if (options is! List ||
          !options.any(
            (option) => '$option'.toLowerCase() == text.toLowerCase(),
          )) {
        return 'Choose an available option for $label.';
      }
    }
  }
  return null;
}
