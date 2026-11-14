import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/settings/settings.repo.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SettingsController extends FeatureController {
  SettingsController(this.repository);
  String? notice;
  final SettingsRepository repository;
  SettingsAccount? account;
  String? error;
  int loadId = 0;
  // Temporary profile preview data; keep fixtures in this controller.
  final Map<String, dynamic> summary = {
    'wallet': 1250,
    'rider_distance_m': 428500,
    'driver_distance_m': 2840600,
    'longest_distance_m': 186400,
    'places_explored': 32,
    'total_earnings': 48650,
    'money_saved': 1840,
    'vehicle_brand': {
      'name': 'Maruti Suzuki',
      'logo_url':
          'https://res.cloudinary.com/drxuvrw65/image/upload/v1792684132/1more-admin/vehicle-brands/74618f08-2e02-44c2-a9d5-42213978f227.webp',
    },
  };
  String version = '';
  String? summaryError;
  String get partnerInformation =>
      'Drive with 1More\n\nApply with your personal information, live selfie, driving licence and vehicle documents. Our team reviews your application and shares updates in the app.\n\nOnce approved, complete activation and vehicle verification, choose your vehicle and go online. Receive ride requests nearby and collect fares in cash or direct UPI.';
  String get faq =>
      'How do I pay?\nPay the driver in cash or direct UPI.\n\nHow do I become a driver?\nUse Partner Program / Apply and follow the application steps.\n\nCan I update my profile?\nOpen Personal / Edit Profile. Use Change Phone Number to update your contact number.\n\nHow do I get help?\nUse Help Me or Report a Complaint to contact support and track replies.\n\nWhere are my journeys?\nOpen My Rides from the home menu. Driver mode has its own trip history.';
  String get privacyInformation =>
      'Privacy Policy\n\nSample content for the profile preview.\n\nInformation we use\nYour account details, trip locations and support messages help provide rides and account services. Driver applications also contain identity and vehicle documents.\n\nYour choices\nYou can edit account details, manage location permissions on your device and contact support about your information.\n\nSharing and security\nTrip participants receive information needed to complete their journey. Account and document access is restricted to authorized services and reviewers.\n\nContact\nUse Help Me for privacy questions.';
  String get termsInformation =>
      'Terms of Service\n\nSample content for the profile preview.\n\nUsing 1More\nProvide accurate account and booking information. Respect other riders, drivers and the safety of everyone on a trip.\n\nBookings and fares\nReview your pickup, destination, vehicle and quoted fare before booking. Cash and direct UPI payments are collected by the driver.\n\nDriver access\nDrivers must complete application review, activation and vehicle verification before accepting rides.\n\nSupport\nReport ride issues through Help Me or Report a Complaint. Our team will review the details supplied.';
  Future<void> load() async {
    final id = ++loadId;
    if (error != null) update(() => error = null);
    try {
      final account = await repository.load();
      if (!isDisposed && id == loadId) update(() => this.account = account);
      unawaited(
        PackageInfo.fromPlatform()
            .then((info) {
              if (!isDisposed && id == loadId) {
                update(() => version = info.version);
              }
            })
            .catchError((Object _) {}),
      );
    } catch (error) {
      if (isDisposed || id != loadId) return;
      if (account == null) {
        update(() => this.error = ApiResult.errorMessage(error));
      } else {
        notice = 'Your profile could not be refreshed. Please try again.';
      }
    }
  }
}
