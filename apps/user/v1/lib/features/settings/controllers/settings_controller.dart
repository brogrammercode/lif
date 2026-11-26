import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/settings/settings.repo.dart';
import 'package:package_info_plus/package_info_plus.dart';

class WalletTransaction {
  final String reference, title;
  final int paise;
  final int? balanceAfterPaise;
  final int? grossPaise, commissionPaise;
  final String? commissionPercent;
  final DateTime date;
  final DateTime? completedAt;
  final String? rideId;
  final String? payoutId;

  const WalletTransaction({
    required this.reference,
    required this.title,
    required this.paise,
    required this.date,
    this.balanceAfterPaise,
    this.grossPaise,
    this.commissionPaise,
    this.commissionPercent,
    this.completedAt,
    this.rideId,
    this.payoutId,
  });

  bool get processing => completedAt == null;
}

class FaqEntry {
  final String question;
  final String answer;

  const FaqEntry({required this.question, required this.answer});
}

/// Owns feature records, query state and asynchronous loading independently of its view.
class SettingsController extends FeatureController {
  SettingsController(this.repository);

  String? notice;
  final SettingsRepository repository;
  SettingsAccount? account;
  String? error;
  bool signingOut = false;
  int loadId = 0;
  // Temporary profile preview data; keep fixtures in this controller.
  final Map<String, dynamic> summary = {
    'rider_distance_m': 428500,
    'driver_distance_m': 2840600,
    'longest_distance_m': 186400,
    'places_explored': 32,
    'money_saved': 1840,
    'vehicle_brand': {
      'name': 'Maruti Suzuki',
      'logo_url':
          'https://res.cloudinary.com/drxuvrw65/image/upload/v1792684132/1more-admin/vehicle-brands/74618f08-2e02-44c2-a9d5-42213978f227.webp',
    },
  };
  String get walletCardholder {
    final name = account?.user.displayName.trim() ?? '';
    return name.isEmpty ? '1MORE RIDER' : name.toUpperCase();
  }

  String version = '';
  String? summaryError;
  int? walletProfilePaise;
  int _walletLoadId = 0;

  Future<void> refreshWalletAmount() async {
    final current = account;
    if (isDisposed || current == null) return;
    final id = ++_walletLoadId;
    try {
      final paise = await repository.walletProfileAmount(
        driver: current.mode == AppMode.driver && current.hasDriverAccess,
      );
      if (id == _walletLoadId && identical(current, account)) {
        update(() => walletProfilePaise = paise);
      }
    } catch (_) {
      if (id == _walletLoadId && identical(current, account)) {
        update(() => walletProfilePaise = null);
      }
    }
  }

  String get partnerInformation =>
      'Drive with 1More\n\nApply with your personal information, live selfie, driving licence and vehicle documents. Our team reviews your application and shares updates in the app.\n\nOnce approved, complete activation and vehicle verification, choose your vehicle and go online. Receive ride requests nearby and collect fares in cash or direct UPI.';
  List<FaqEntry> get faq => const [
    FaqEntry(
      question: 'How do I pay for a ride?',
      answer:
          'Choose an available payment method at the end of the ride. Wallet payments are confirmed in the app. For cash or direct UPI, your driver confirms receipt.',
    ),
    FaqEntry(
      question: 'How do I become a driver?',
      answer:
          'Open Partner Program from your profile and choose Apply. Complete the application, upload the required identity and vehicle documents, and submit it for review. You can check your application status in the app.',
    ),
    FaqEntry(
      question: 'How do I update my profile or phone number?',
      answer:
          'Open Profile settings and choose Edit Profile. Tap your name or phone number to edit it, then save your changes.',
    ),
    FaqEntry(
      question: 'How do I contact support?',
      answer:
          'Open Help Me to contact support, or choose Report a Complaint to send details about a ride or account issue. You can review replies in your support requests.',
    ),
    FaqEntry(
      question: 'Where can I see my past rides?',
      answer:
          'Open My Rides from the Personal section of your profile. Driver accounts have a separate ride history for trips completed as a driver.',
    ),
  ];
  String get privacyInformation =>
      'Privacy Policy\n\nSample content for the profile preview.\n\nInformation we use\nYour account details, trip locations and support messages help provide rides and account services. Driver applications also contain identity and vehicle documents.\n\nYour choices\nYou can edit account details, manage location permissions on your device and contact support about your information.\n\nSharing and security\nTrip participants receive information needed to complete their journey. Account and document access is restricted to authorized services and reviewers.\n\nContact\nUse Help Me for privacy questions.';
  String get termsInformation =>
      'Terms of Service\n\nSample content for the profile preview.\n\nUsing 1More\nProvide accurate account and booking information. Respect other riders, drivers and the safety of everyone on a trip.\n\nBookings and fares\nReview your pickup, destination, vehicle and quoted fare before booking. Cash and direct UPI payments are collected by the driver.\n\nDriver access\nDrivers must complete application review, activation and vehicle verification before accepting rides.\n\nSupport\nReport ride issues through Help Me or Report a Complaint. Our team will review the details supplied.';
  Future<void> load() async {
    final id = ++loadId;
    if (error != null) update(() => error = null);
    try {
      final account = await repository.load();
      if (isDisposed || id != loadId) return;
      update(() {
        if (this.account?.mode != account.mode ||
            this.account?.user.id != account.user.id) {
          walletProfilePaise = null;
        }
        this.account = account;
      });
      unawaited(refreshWalletAmount());
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

  Future<void> signOut() async {
    if (signingOut) return;
    update(() => signingOut = true);
    try {
      await repository.signOut();
    } finally {
      update(() => signingOut = false);
    }
  }
}
