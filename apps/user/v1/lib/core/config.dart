import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  static String get API_BASE_URL =>
      dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:4000/api/v1';
  static String get GOOGLE_SERVER_CLIENT_ID =>
      dotenv.env['GOOGLE_SERVER_CLIENT_ID'] ?? '';
}
