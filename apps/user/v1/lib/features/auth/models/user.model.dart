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
  });

  String get displayName => [
    firstName,
    lastName,
  ].whereType<String>().where((value) => value.isNotEmpty).join(' ');

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: '${json['id'] ?? ''}',
    role: '${json['role'] ?? 'RIDER'}',
    status: '${json['status'] ?? 'ACTIVE'}',
    firstName: json['first_name'] as String?,
    lastName: json['last_name'] as String?,
    email: json['email'] as String?,
    phoneE164: json['phone_e164'] as String?,
    avatarUrl: json['avatar_url'] as String?,
    lastKnownLatitude: (json['last_known_latitude'] as num?)?.toDouble(),
    lastKnownLongitude: (json['last_known_longitude'] as num?)?.toDouble(),
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
  };
}
