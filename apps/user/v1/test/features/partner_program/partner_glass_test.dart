import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/partner_program/pages/activation_page.dart';
import 'package:user/features/partner_program/pages/driver_exit_page.dart';
import 'package:user/features/partner_program/pages/partner_program_page.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';
import 'partner_submission_test.dart' as fixtures;

class GlassWorkflow extends PartnerProgramRepository {
  String? status;
  Map<String, dynamic>? confirmationInput;
  int downloads = 0;
  GlassWorkflow(this.status);
  @override
  Future<Map<String, dynamic>> workflow() async => {
    'policy': {
      'title': 'Partner Program policy',
      'version': 2,
      'html':
          '<h3>Your journey with 1More</h3><p>Review the requirements before applying. Your documents are checked by our team.</p><h3>A clear, fair partnership</h3><ul><li>Keep your information accurate.</li><li>Follow the published safety requirements.</li></ul>',
    },
    'confirmation': {
      'title': 'Partner confirmation',
      'version': 3,
      'html':
          '<h3>Ready for the next step</h3><p>Confirm that the reviewed details are accurate and that you accept the Partner Program requirements.</p>',
    },
    'application': status == null
        ? null
        : <String, dynamic>{
            'id': 'fixture-app',
            'status': status,
            'version': 7,
            'contact_email': 'alex@example.test',
            'whatsapp_phone': '+919999999999',
            'final_pdf_id': 'fixture-pdf',
            'fields': [
              {
                'requirement_id': 'name',
                'value': 'Alex Morgan',
                'status': 'APPROVED',
              },
              {
                'requirement_id': 'licence',
                'value': ['fixture-document'],
                'status': status == 'CHANGES_REQUESTED'
                    ? 'REJECTED'
                    : 'PENDING',
                'rejection_reason': 'Upload a clearer copy.',
              },
              {
                'requirement_id': '__live_selfie__',
                'value': [],
                'status': 'APPROVED',
              },
            ],
          },
    'requirements': [
      {
        'id': 'name',
        'label': 'Full name',
        'field_type': 'STRING',
        'is_required': true,
        'category': {'name': 'Personal details'},
      },
      {
        'id': 'licence',
        'label': 'Driving licence',
        'field_type': 'PDF',
        'is_required': true,
        'category': {'name': 'Documents'},
      },
      {
        'id': '__live_selfie__',
        'label': 'Live selfie',
        'field_type': 'IMAGE',
        'is_required': true,
        'capture_mode': 'CAMERA',
        'category': {'name': 'Documents'},
      },
    ],
    'assets': [
      {'id': 'fixture-document', 'file_name': 'licence.pdf'},
    ],
  };
  @override
  Future<void> confirm(Map<String, dynamic> input) async {
    confirmationInput = input;
    status = 'CONFIRMATION_SUBMITTED';
  }

  @override
  Future<void> download(String id) async {
    downloads++;
  }

  @override
  Future<Map<String, dynamic>?> exitRequest() async => {
    'id': 'fixture-exit',
    'version': 1,
    'status': 'COMPLETED',
    'reason': 'Personal commitments',
    'dues_amount': 0,
    'currency': 'INR',
    'dues_direction': 'NONE',
    'settlement_pdf_id': 'settlement',
  };
}

final preview = GlobalKey();
Widget shell(Widget child) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, _) => MaterialApp(
    key: UniqueKey(),
    theme: ThemeData(useMaterial3: true, fontFamily: 'Outfit'),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: true),
      child: child!,
    ),
    home: RepaintBoundary(key: preview, child: child),
  ),
);
Widget program(GlassWorkflow repo) => PartnerProgramPage(
  repository: repo,
  currentUser: () async => const UserModel(
    id: 'fixture',
    role: 'RIDER',
    status: 'ACTIVE',
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex@example.test',
    phoneE164: '+919999999999',
  ),
  createDraftStore: (_) async => fixtures.MemoryDraft(),
);
Future<void> capture(WidgetTester tester, String name) async {
  if (!const bool.fromEnvironment('SETTINGS_PREVIEW')) return;
  await tester.runAsync(() async {
    final boundary =
        preview.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final directory = Directory('build/ui-review');
    await directory.create(recursive: true);
    await File(
      '${directory.path}/$name.png',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(() async {
    dotenv.loadFromString(
      envString: 'API_BASE_URL=https://fixture.test/api/v2',
    );
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    final font = File('.dart_tool/settings-preview-font.ttf');
    if (font.existsSync()) {
      final face = FontLoader('Outfit')
        ..addFont(Future.value(ByteData.sublistView(font.readAsBytesSync())));
      await face.load();
    }
  });

  testWidgets(
    'nested glass shares one blur and shimmer does not mask backdrop surfaces',
    (tester) async {
      await tester.pumpWidget(
        shell(
          const LiquidGlassScope(
            child: LiquidGlassBackdrop(
              child: Center(
                child: LiquidGlassSurface(
                  child: LiquidGlassSurface(child: Text('Glass')),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(BackdropFilter), findsOneWidget);
      expect(find.byType(ShaderMask), findsNothing);
    },
  );

  for (final status in <String?>[
    null,
    'CHANGES_REQUESTED',
    'CONFIRMATION_SUBMITTED',
  ]) {
    testWidgets(
      'renders glass workflow ${status ?? 'policy'} and preserves content',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(shell(program(GlassWorkflow(status))));
        await tester.pumpAndSettle();
        expect(find.byType(LiquidGlassSurface), findsWidgets);
        expect(find.byType(CircularProgressIndicator), findsNothing);
        expect(tester.takeException(), isNull);
        if (status == null) {
          expect(
            find.textContaining('Your journey with 1More'),
            findsOneWidget,
          );
          await capture(tester, 'glass-partner-policy');
          await fixtures.press(tester, find.byType(CheckboxListTile));
          await fixtures.press(tester, find.text('Continue to application'));
          await tester.drag(find.byType(ListView).first, const Offset(0, 1000));
          await tester.pumpAndSettle();
          await capture(tester, 'glass-partner-application');
        } else if (status == 'CHANGES_REQUESTED') {
          await fixtures.press(
            tester,
            find.text('Correction required: Upload a clearer copy.'),
          );
          expect(
            find.text('Correction required: Upload a clearer copy.'),
            findsOneWidget,
          );
          await capture(tester, 'glass-partner-corrections');
        } else {
          expect(find.text('Submit confirmation'), findsNothing);
          expect(
            find.textContaining('Your confirmation is with the administrator.'),
            findsOneWidget,
          );
          await capture(tester, 'glass-partner-confirmation');
        }
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('confirmation keeps legal-name consent and revision checks', (
    tester,
  ) async {
    final repo = GlassWorkflow('APPROVED');
    await tester.pumpWidget(shell(program(repo)));
    await tester.pumpAndSettle();
    expect(repo.confirmationInput, isNull);
    await fixtures.press(tester, find.byType(CheckboxListTile));
    await fixtures.press(tester, find.text('Submit confirmation'));
    expect(repo.confirmationInput, {
      'version': 7,
      'document_version': 3,
      'signature_name': 'Alex Morgan',
      'accepted': true,
    });
    expect(
      find.textContaining('Your confirmation is with the administrator.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'final approval keeps the PDF action and activation keeps six-digit entry',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repo = GlassWorkflow('COMPLETED');
      await tester.pumpWidget(shell(program(repo)));
      await tester.pumpAndSettle();
      await capture(tester, 'glass-partner-final');
      await fixtures.press(tester, find.text('Download final PDF'));
      expect(repo.downloads, 1);
      await tester.pumpWidget(shell(const PartnerActivationPage()));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '12a34567');
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        '123456',
      );
      expect(find.byType(LiquidGlassButton), findsOneWidget);
      await capture(tester, 'glass-partner-activation');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('completed exit retains its settlement PDF in the glass layout', (
    tester,
  ) async {
    await tester.pumpWidget(
      shell(DriverExitPage(repository: GlassWorkflow('EXITED'))),
    );
    await tester.pumpAndSettle();
    expect(find.text('Download settlement PDF'), findsOneWidget);
    expect(find.text('Request partner exit'), findsNothing);
    expect(find.byType(LiquidGlassSurface), findsWidgets);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
