import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/focus_field_hint.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'partner_category_steps_test.dart' as categories;
import 'partner_glass_test.dart' as glass;
import 'partner_submission_test.dart' as fixtures;

class HintWorkflow extends categories.CategoryWorkflow {
  @override
  List<Map<String, dynamic>> get definitions => super.definitions
      .map(
        (field) => {
          ...field,
          if (field['id'] == 'name')
            'description': 'Use the name shown on your identity document.',
        },
      )
      .toList();
}

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://fixture.test/api/v2',
    ),
  );

  testWidgets(
    'application guidance is hidden at rest, follows typing focus and hides on blur',
    (tester) async {
      final repo = HintWorkflow(), store = fixtures.MemoryDraft();
      await categories.begin(tester, repo, store);
      expect(
        find.text(
          'Your administrator will review these contacts before sharing your final document.',
        ),
        findsNothing,
      );
      await fixtures.press(tester, find.text('Continue'));
      const hint = 'Use the name shown on your identity document.';
      expect(find.text(hint), findsNothing);
      await tester.enterText(find.byType(TextFormField), 'Alex Morgan');
      await tester.pumpAndSettle();
      expect(find.text(hint), findsOneWidget);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(find.text(hint), findsNothing);
      await fixtures.press(tester, find.text('Continue'));
      expect(find.textContaining('Up to 3 MB'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'helper visibility does not hide validation/rejection and locked fields have no helper',
    (tester) async {
      final key = GlobalKey<FormState>();
      await tester.pumpWidget(
        glass.shell(
          LiquidGlassPage(
            title: 'Details',
            child: Form(
              key: key,
              child: Column(
                children: [
                  FocusFieldHint(
                    hint: 'Helpful writing guidance',
                    child: TextFormField(
                      validator: (value) => value?.isNotEmpty == true
                          ? null
                          : 'This field is required.',
                    ),
                  ),
                  const Text(
                    'Correction required: Use a clear identity document.',
                  ),
                  const FocusFieldHint(
                    enabled: false,
                    hint: 'Locked field guidance',
                    child: TextField(enabled: false),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      expect(key.currentState!.validate(), isFalse);
      await tester.pumpAndSettle();
      expect(find.text('This field is required.'), findsOneWidget);
      expect(
        find.text('Correction required: Use a clear identity document.'),
        findsOneWidget,
      );
      expect(find.text('Helpful writing guidance'), findsNothing);
      expect(find.text('Locked field guidance'), findsNothing);
      await tester.enterText(find.byType(TextFormField), 'valid');
      await tester.pumpAndSettle();
      expect(find.text('Helpful writing guidance'), findsOneWidget);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(find.text('Helpful writing guidance'), findsNothing);
      expect(
        find.text('Correction required: Use a clear identity document.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
