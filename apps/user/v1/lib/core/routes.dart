import 'package:flutter/material.dart';
import 'package:user/features/auth/pages/login_page.dart';
import 'package:user/features/home/pages/home_page.dart';
import 'package:user/features/search/pages/search_page.dart';
import 'package:user/features/ride/pages/ride_page.dart';

class AppRoutes {
  static const String login = '/login';
  static const String home = '/home';
  static const String search = '/search';
  static const String ride = '/ride';

  static Map<String, WidgetBuilder> get routes => {
    login: (context) => const LoginPage(),
    home: (context) => const HomePage(),
    search: (context) => const SearchPage(),
    ride: (context) => const RidePage(),
  };
}
