import 'package:flutter/material.dart';
import 'package:user/features/auth/pages/login_page.dart';
import 'package:user/features/home/pages/home_page.dart';
import 'package:user/features/auth/pages/session_gate.dart';
import 'package:user/features/profile/pages/profile_page.dart';
import 'package:user/features/rides/pages/rides_page.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/saved_places/pages/saved_places_page.dart';
import 'package:user/features/notifications/pages/notifications_page.dart';
import 'package:user/features/emergency/pages/emergency_contacts_page.dart';
import 'package:user/features/support/pages/support_page.dart';
import 'package:user/features/support/pages/support_ticket_page.dart';
import 'package:user/features/payments/pages/payment_methods_page.dart';
import 'package:user/features/settings/pages/settings_page.dart';

class AppRoutes {
  static const String login = '/login';
  static const String home = '/home';
  static const String search = '/search';
  static const String ride = '/ride';
  static const String gate = '/';
  static const String profile = '/profile';
  static const String rides = '/rides';
  static const String rideDetail = '/ride-detail';
  static const String savedPlaces = '/saved-places';
  static const String notifications = '/notifications';
  static const String emergencyContacts = '/emergency-contacts';
  static const String support = '/support';
  static const String supportTicket = '/support-ticket';
  static const String paymentMethods = '/payment-methods';
  static const String settings = '/settings';

  static Map<String, WidgetBuilder> get routes => {
    gate: (context) => const SessionGate(),
    login: (context) => const LoginPage(),
    home: (context) => const HomePage(),
    profile: (context) => const ProfilePage(),
    rides: (context) => const RidesPage(),
    rideDetail: (context) => const RideDetailPage(),
    savedPlaces: (context) => const SavedPlacesPage(),
    notifications: (context) => const NotificationsPage(),
    emergencyContacts: (context) => const EmergencyContactsPage(),
    support: (context) => const SupportPage(),
    supportTicket: (context) => const SupportTicketPage(),
    paymentMethods: (context) => const PaymentMethodsPage(),
    settings: (context) => const SettingsPage(),
  };
}
