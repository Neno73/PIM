import React, { useState } from "react";
import {
  Button,
  Typography,
  Flex,
  Badge,
  Tooltip,
} from "@strapi/design-system";
import { Play, Clock, CheckCircle, Information } from "@strapi/icons";
import { useFetchClient, useNotification } from "@strapi/strapi/admin";

const SyncButton = ({ supplier }: { supplier: any }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    supplier.last_sync_status || "never"
  );
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const handleSync = async () => {
    setIsLoading(true);
    setSyncStatus("running");

    try {
      const response = await post(`/api/suppliers/${supplier.id}/sync`);

      if (response.data.success) {
        setSyncStatus("completed");
        toggleNotification({
          type: "success",
          message: `✅ Sync completed for ${supplier.code}: ${response.data.productsProcessed} products processed (${response.data.imported} imported, ${response.data.updated} updated)`,
        });

        // Refresh the page to show updated data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setSyncStatus("failed");
        toggleNotification({
          type: "danger",
          message: response.data.message || "Sync failed",
        });
      }
    } catch (error: any) {
      setSyncStatus("failed");
      toggleNotification({
        type: "danger",
        message: `❌ Sync failed for ${supplier.code}: ${error.response?.data?.error?.message || error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = () => {
    switch (syncStatus) {
      case "running":
        return (
          <Badge backgroundColor="secondary500" textColor="neutral0">
            <Clock />
            Running
          </Badge>
        );
      case "completed":
        return (
          <Badge backgroundColor="success500" textColor="neutral0">
            <CheckCircle />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge backgroundColor="danger500" textColor="neutral0">
            ❌ Failed
          </Badge>
        );
      default:
        return (
          <Badge backgroundColor="neutral150" textColor="neutral600">
            <Information />
            Never
          </Badge>
        );
    }
  };

  return (
    <Flex gap={2} alignItems="center">
      {getStatusBadge()}

      <Tooltip description="Click to sync this supplier's products">
        <Button
          onClick={handleSync}
          loading={isLoading}
          disabled={isLoading}
          variant="secondary"
          size="S"
          startIcon={<Play />}
        >
          Sync
        </Button>
      </Tooltip>
    </Flex>
  );
};

// Custom injection for supplier collection view
export const injectColumnInTable = (columnHeaders: any[], data: any) => {
  // Add sync column header
  const syncHeader = {
    name: "sync_actions",
    fieldSchema: { type: "custom" },
    metadatas: { label: "Sync Actions", searchable: false, sortable: false },
  };

  return [...columnHeaders, syncHeader];
};

export const injectRow = (tableData: any[], data: any) => {
  // Add sync button for each row
  return tableData.map((row: any) => ({
    ...row,
    sync_actions: <SyncButton supplier={row} />,
  }));
};

export default {
  injectColumnInTable,
  injectRow,
};
