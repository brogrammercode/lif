class UserModel {
  final String id;
  final String role;
  final String status;
  final String? first_name;
  final String? last_name;
  final String? email;
  final String? phone_e164;
  final String? avatar_url;

  const UserModel({
    required this.id,
    required this.role,
    required this.status,
    this.first_name,
    this.last_name,
    this.email,
    this.phone_e164,
    this.avatar_url,
  });

  String get display_name => [
    first_name,
    last_name,
  ].whereType<String>().where((value) => value.isNotEmpty).join(' ');

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: '${json['id'] ?? ''}',
    role: '${json['role'] ?? 'RIDER'}',
    status: '${json['status'] ?? 'ACTIVE'}',
    first_name: json['first_name'] as String?,
    last_name: json['last_name'] as String?,
    email: json['email'] as String?,
    phone_e164: json['phone_e164'] as String?,
    avatar_url: json['avatar_url'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'status': status,
    'first_name': first_name,
    'last_name': last_name,
    'email': email,
    'phone_e164': phone_e164,
    'avatar_url': avatar_url,
  };
}
