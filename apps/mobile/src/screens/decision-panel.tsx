import type { Requisition } from '@procurely/shared-types';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from '../components/theme';
import { Button, ErrorNote, TextField } from '../components/ui';
import { useCompanyMutation, writeErrorMessage } from '../features/data';

type Decision =
  { action: 'approve'; comment: string } | { action: 'reject'; reason: string };

/**
 * Approve or reject as far as the API offers either, with one comment field. The comment is
 * optional for Approve and the required reason for Reject. The requester reads it.
 */
export function DecisionPanel(props: {
  companyId: string;
  requisition: Requisition;
  onDecided?: (decided: Requisition) => void;
}) {
  const { companyId, requisition: r } = props;
  const [comment, setComment] = useState('');
  const { onDecided } = props;
  // Reported from the write itself: the refetch that follows hides this panel, and a callback
  // passed to mutate() is dropped once its component is gone.
  const decide = useCompanyMutation(
    companyId,
    async (api, token, d: Decision) => {
      const decided =
        d.action === 'approve'
          ? await api.approveRequisition(token, companyId, r.id, {
              comment: d.comment.trim() || undefined,
            })
          : await api.rejectRequisition(token, companyId, r.id, {
              reason: d.reason.trim(),
            });
      onDecided?.(decided);
      return decided;
    },
  );
  const canReject = r.actions.includes('reject');
  return (
    <View style={styles.panel}>
      <TextField label="Comment" value={comment} onChangeText={setComment} />
      {canReject && (
        <Text style={styles.hint}>
          A comment is required to reject. It is optional to approve.
        </Text>
      )}
      <View style={styles.actions}>
        {canReject && (
          <Button
            label="Reject"
            variant="destructive"
            disabled={decide.isPending || comment.trim() === ''}
            onPress={() => decide.mutate({ action: 'reject', reason: comment })}
          />
        )}
        {r.actions.includes('approve') && (
          <Button
            label="Approve"
            variant="primary"
            disabled={decide.isPending}
            onPress={() => decide.mutate({ action: 'approve', comment })}
          />
        )}
      </View>
      {decide.isError && (
        <ErrorNote message={writeErrorMessage(decide.error)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: theme.space.sm },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: theme.palette.muted,
  },
  actions: { flexDirection: 'row', gap: theme.space.md },
});
