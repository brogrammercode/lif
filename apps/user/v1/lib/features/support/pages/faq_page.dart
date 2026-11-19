import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/settings/controllers/settings_controller.dart';

class FaqPage extends StatelessWidget {
  final List<FaqEntry> entries;
  const FaqPage({super.key, required this.entries});

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'FAQ',
    child: _FaqAccordion(entries: entries),
  );
}

class _FaqAccordion extends StatefulWidget {
  final List<FaqEntry> entries;
  const _FaqAccordion({required this.entries});

  @override
  State<_FaqAccordion> createState() => _FaqAccordionState();
}

class _FaqAccordionState extends State<_FaqAccordion> {
  int? _openIndex = 0;

  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
    itemCount: widget.entries.length,
    separatorBuilder: (_, _) => const SizedBox(height: 10),
    itemBuilder: (context, index) {
      final entry = widget.entries[index];
      return _FaqAccordionRow(
        key: ValueKey(entry.question),
        entry: entry,
        expanded: _openIndex == index,
        onTap: () =>
            setState(() => _openIndex = _openIndex == index ? null : index),
      );
    },
  );
}

class _FaqAccordionRow extends StatelessWidget {
  final FaqEntry entry;
  final bool expanded;
  final VoidCallback onTap;
  const _FaqAccordionRow({
    super.key,
    required this.entry,
    required this.expanded,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xFFF6F6F6),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 15, 16, 15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    entry.question,
                    style: const TextStyle(
                      fontSize: 15,
                      height: 1.35,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: Icon(
                    expanded ? Icons.close_rounded : Icons.add_rounded,
                    size: 17,
                    color: RideTokens.ink,
                  ),
                ),
              ],
            ),
            AnimatedSize(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              alignment: Alignment.topCenter,
              child: expanded
                  ? Padding(
                      padding: const EdgeInsets.only(top: 9, right: 22),
                      child: Text(
                        entry.answer,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    )
                  : const SizedBox(width: double.infinity, height: 0),
            ),
          ],
        ),
      ),
    ),
  );
}
