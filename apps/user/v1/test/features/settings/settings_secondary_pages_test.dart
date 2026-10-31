import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/features/emergency/pages/emergency_contacts_page.dart';
import 'package:user/features/notifications/pages/notifications_page.dart';
import 'package:user/features/payments/pages/payment_methods_page.dart';
import 'package:user/features/support/pages/support_page.dart';
import 'package:user/features/support/pages/support_ticket_page.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class FakeSecondarySettingsRepository extends UserAppRepository {
  List<Map<String, dynamic>> notificationRows = [
    {
      'id': 'notification-a',
      'type': 'ACCOUNT',
      'title': 'Account review complete',
      'body': 'Your account review has been completed.',
      'read_at': null,
      'created_at': '2026-10-31T08:00:00.000Z',
      'data': <String, dynamic>{},
    },
  ];
  List<Map<String, dynamic>> contactRows = [];
  List<Map<String, dynamic>> paymentRows = [];
  List<Map<String, dynamic>> ticketRows = [
    {
      'id': 'support-ticket-12345678',
      'subject': 'Pickup concern',
      'status': 'WAITING_FOR_USER',
      'priority': 'HIGH',
      'created_at': '2026-10-30T08:00:00.000Z',
      'updated_at': '2026-10-31T08:00:00.000Z',
      'messages': [
        {
          'id': 'message-a',
          'author_id': 'user-a',
          'body': 'I need help with a pickup.',
          'created_at': '2026-10-30T08:00:00.000Z',
        },
        {
          'id': 'message-b',
          'author_id': 'admin-a',
          'body': 'Please share the ride reference.',
          'created_at': '2026-10-31T08:00:00.000Z',
        },
      ],
    },
  ];
  int createdContacts = 0;
  int updatedContacts = 0;
  int createdPayments = 0;
  int createdTickets = 0;
  int sentMessages = 0;

  @override
  Future<List<Map<String, dynamic>>> notifications() async => notificationRows;

  @override
  Future<void> readNotification(String id) async {
    notificationRows.firstWhere((row) => row['id'] == id)['read_at'] =
        DateTime.now().toIso8601String();
  }

  @override
  Future<List<Map<String, dynamic>>> emergencyContacts() async => contactRows;

  @override
  Future<void> addEmergencyContact(Map<String, dynamic> input) async {
    createdContacts++;
    contactRows = [
      ...contactRows,
      {
        'id': 'contact-$createdContacts',
        ...input,
        'created_at': '2026-10-31T08:00:00.000Z',
      },
    ];
  }

  @override
  Future<void> updateEmergencyContact(
    String id,
    Map<String, dynamic> input,
  ) async {
    updatedContacts++;
    contactRows = [
      for (final row in contactRows)
        if (row['id'] == id) {'id': id, ...input} else row,
    ];
  }

  @override
  Future<void> deleteEmergencyContact(String id) async {
    contactRows = contactRows.where((row) => row['id'] != id).toList();
  }

  @override
  Future<List<Map<String, dynamic>>> paymentMethods() async => paymentRows;

  @override
  Future<void> addPaymentMethod(Map<String, dynamic> input) async {
    createdPayments++;
    paymentRows = [
      {
        'id': 'payment-$createdPayments',
        ...input,
        'created_at': '2026-10-31T08:00:00.000Z',
      },
    ];
  }

  @override
  Future<void> deletePaymentMethod(String id) async {
    paymentRows = paymentRows.where((row) => row['id'] != id).toList();
  }

  @override
  Future<Map<String, dynamic>> supportContacts() async => {
    'support_phone': '+911234567890',
    'support_email': 'help@example.test',
    'support_hours': '9 AM to 8 PM',
  };

  @override
  Future<List<Map<String, dynamic>>> supportTickets() async => ticketRows;

  @override
  Future<Map<String, dynamic>> supportTicket(String id) async =>
      ticketRows.firstWhere((ticket) => ticket['id'] == id);

  @override
  Future<Map<String, dynamic>> profile() async => {'id': 'user-a'};

  @override
  Future<void> createSupportTicket(
    Map<String, dynamic> input, {
    String? requestKey,
  }) async {
    createdTickets++;
    ticketRows = [
      {
        'id': 'new-ticket-$createdTickets',
        'subject': input['subject'],
        'status': 'OPEN',
        'priority': input['priority'],
        'created_at': '2026-10-31T08:00:00.000Z',
        'updated_at': '2026-10-31T08:00:00.000Z',
        'messages': [
          {
            'id': 'new-message-$createdTickets',
            'author_id': 'user-a',
            'body': input['body'],
            'created_at': '2026-10-31T08:00:00.000Z',
          },
        ],
      },
      ...ticketRows,
    ];
  }

  @override
  Future<void> sendSupportMessage(String id, String body) async {
    sentMessages++;
    final ticket = ticketRows.firstWhere((ticket) => ticket['id'] == id);
    final messages = List<Map<String, dynamic>>.from(
      (ticket['messages'] as List).map(
        (message) => Map<String, dynamic>.from(message as Map),
      ),
    );
    messages.add({
      'id': 'sent-$sentMessages',
      'author_id': 'user-a',
      'body': body,
      'created_at': '2026-10-31T09:00:00.000Z',
    });
    ticket['messages'] = messages;
    ticket['status'] = 'OPEN';
  }
}

Widget screen(Widget child, {double textScale = 1}) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, _) => MaterialApp(
    theme: ThemeData(
      useMaterial3: true,
      fontFamily: 'Outfit',
      colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primaryGreen),
    ),
    builder: (context, page) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        disableAnimations: true,
        textScaler: TextScaler.linear(textScale),
      ),
      child: page!,
    ),
    home: child,
  ),
);

void main() {
  setUpAll(() {
    dotenv.loadFromString(
      envString: 'API_BASE_URL=https://fixture.test/api/v2',
    );
  });

  testWidgets('notifications use glass filters and real unread context', (
    tester,
  ) async {
    final repository = FakeSecondarySettingsRepository();
    await tester.pumpWidget(screen(NotificationsPage(repository: repository)));
    await tester.pumpAndSettle();

    expect(find.text('1 unread update'), findsOneWidget);
    expect(find.text('All (1)'), findsOneWidget);
    expect(find.text('Unread (1)'), findsOneWidget);
    expect(find.text('Account review complete'), findsOneWidget);
    expect(find.byType(LiquidGlassSurface), findsWidgets);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('emergency contact add and update retain validated E164 data', (
    tester,
  ) async {
    final repository = FakeSecondarySettingsRepository();
    await tester.pumpWidget(
      screen(EmergencyContactsPage(repository: repository)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Add emergency contact'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Maya Singh');
    await tester.enterText(find.byType(TextFormField).at(1), '+91 98765 43210');
    await tester.enterText(find.byType(TextFormField).at(2), 'Sister');
    await tester.tap(find.text('Add contact'));
    await tester.pumpAndSettle();

    expect(repository.createdContacts, 1);
    expect(repository.contactRows.single['phone_e164'], '+919876543210');
    expect(find.text('Maya Singh'), findsOneWidget);

    await tester.tap(find.byTooltip('Contact actions for Maya Singh'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit details'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(2), 'Friend');
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    expect(repository.updatedContacts, 1);
    expect(repository.contactRows.single['relationship'], 'Friend');
  });

  testWidgets('support requests expose channels, status and compact detail', (
    tester,
  ) async {
    final repository = FakeSecondarySettingsRepository();
    await tester.pumpWidget(screen(SupportPage(repository: repository)));
    await tester.pumpAndSettle();

    expect(find.text('Direct support channels'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Pickup concern'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Pickup concern'), findsOneWidget);
    expect(find.text('Waiting For User'), findsOneWidget);
    expect(find.text('High priority'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets(
    'support conversation distinguishes participant messages and replies',
    (tester) async {
      final repository = FakeSecondarySettingsRepository();
      await tester.pumpWidget(
        screen(
          SupportTicketPage(
            repository: repository,
            ticketId: 'support-ticket-12345678',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('You'), findsOneWidget);
      expect(find.text('1More Support'), findsOneWidget);
      await tester.enterText(find.byType(TextField).last, 'Ride ABC123');
      await tester.tap(find.byTooltip('Send reply'));
      await tester.pumpAndSettle();

      expect(repository.sentMessages, 1);
      expect(find.text('Ride ABC123'), findsOneWidget);
    },
  );

  testWidgets(
    'payments explain direct collection and avoid duplicate cash setup',
    (tester) async {
      final repository = FakeSecondarySettingsRepository();
      await tester.pumpWidget(
        screen(PaymentMethodsPage(repository: repository)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Pay the driver directly'), findsOneWidget);
      expect(find.text('Direct UPI'), findsWidgets);
      expect(find.text('Zero commission'), findsOneWidget);
      await tester.tap(find.byTooltip('Add cash method'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add cash'));
      await tester.pumpAndSettle();

      expect(repository.createdPayments, 1);
      expect(find.byTooltip('Add cash method'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Default'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Default'), findsOneWidget);
    },
  );

  testWidgets(
    'secondary settings remain reachable at small size with large text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = FakeSecondarySettingsRepository();

      await tester.pumpWidget(
        screen(EmergencyContactsPage(repository: repository), textScale: 1.8),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Add emergency contact').last);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(
        screen(SupportPage(repository: repository), textScale: 1.8),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(
        screen(PaymentMethodsPage(repository: repository), textScale: 1.8),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(
        screen(NotificationsPage(repository: repository), textScale: 1.8),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
