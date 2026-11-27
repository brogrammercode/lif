class UserModel {
  final String id;
  final String role;
  final String status;
  final String? firstName;
  final String? lastName;
  final String? email;
  final String? phoneE164;
  final String? avatarUrl;
  final double? lastKnownLatitude;
  final double? lastKnownLongitude;
  final String? partnerStatus;
  final bool partnerActivationRequired;
  final bool hasPartnerExit;

  const UserModel({
    required this.id,
    required this.role,
    required this.status,
    this.firstName,
    this.lastName,
    this.email,
    this.phoneE164,
    this.avatarUrl,
    this.lastKnownLatitude,
    this.lastKnownLongitude,
    this.partnerStatus,
    this.partnerActivationRequired = false,
    this.hasPartnerExit = false,
  });

  String get displayName => [
    firstName,
    lastName,
  ].whereType<String>().where((value) => value.isNotEmpty).join(' ');

  static double? _coordinate(Object? value, double limit) {
    final number = switch (value) {
      num value => value.toDouble(),
      String value => double.tryParse(value),
      _ => null,
    };
    return number != null && number.isFinite && number.abs() <= limit
        ? number
        : null;
  }

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: '${json['id'] ?? ''}',
    role: '${json['role'] ?? 'RIDER'}',
    status: '${json['status'] ?? 'ACTIVE'}',
    firstName: json['first_name'] as String?,
    lastName: json['last_name'] as String?,
    email: json['email'] as String?,
    phoneE164: json['phone_e164'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    lastKnownLatitude: _coordinate(json['last_known_latitude'], 90),
    lastKnownLongitude: _coordinate(json['last_known_longitude'], 180),
    partnerStatus: json['partner_status'] as String?,
    partnerActivationRequired: json['partner_activation_required'] == true,
    hasPartnerExit:
        json['has_partner_exit'] == true || json['partner_status'] == 'EXITED',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'status': status,
    'first_name': firstName,
    'last_name': lastName,
    'email': email,
    'phone_e164': phoneE164,
    'avatar_url': avatarUrl,
    'last_known_latitude': lastKnownLatitude,
    'last_known_longitude': lastKnownLongitude,
    'partner_status': partnerStatus,
    'partner_activation_required': partnerActivationRequired,
    'has_partner_exit': hasPartnerExit,
  };
}
