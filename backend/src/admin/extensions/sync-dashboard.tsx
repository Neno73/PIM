import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Flex,
  Badge,
  Loader,
} from '@strapi/design-system';
import { CheckCircle, Clock, Play, ArrowClockwise } from '@strapi/icons';

interface Supplier {
  id: string;
  documentId: string;
  code: string;
  name: string;
  is_active: boolean;
  auto_import: boolean;
  last_sync?: string;
  sync_status?: string;
  product_count?: number;
}

const SyncDashboard: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/suppliers?populate=*&pagination[limit]=100');
      const data = await response.json();
      setSuppliers(data?.data || []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncSupplier = async (supplierId: string, supplierName: string) => {
    try {
      setSyncing(prev => ({ ...prev, [supplierId]: true }));
      
      const response = await fetch(`/api/suppliers/${supplierId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result?.success) {
        alert(`Sync completed for ${supplierName}. Products processed: ${result.productsProcessed || 0}`);
        await loadSuppliers(); // Refresh data
      } else {
        alert(result?.message || `Sync failed for ${supplierName}`);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert(`Sync failed for ${supplierName}: ${error}`);
    } finally {
      setSyncing(prev => ({ ...prev, [supplierId]: false }));
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getSyncStatusColor = (status?: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'running': return 'warning';
      default: return 'neutral';
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  if (loading) {
    return (
      <Box padding={8}>
        <Flex justifyContent="center" alignItems="center" minHeight="400px">
          <Loader>Loading suppliers...</Loader>
        </Flex>
      </Box>
    );
  }

  return (
    <Box padding={8}>
      {/* Header */}
      <Box marginBottom={6}>
        <Typography variant="alpha" tag="h1">
          Supplier Sync Dashboard
        </Typography>
        <Typography variant="omega" textColor="neutral600">
          Manage manual synchronization for each supplier
        </Typography>
      </Box>

      {/* Action Buttons */}
      <Box marginBottom={6}>
        <Flex gap={2}>
          <Button
            variant="default"
            startIcon={<ArrowClockwise />}
            onClick={loadSuppliers}
            loading={loading}
          >
            Refresh Status
          </Button>
        </Flex>
      </Box>

      {/* Suppliers List */}
      <Box>
        {suppliers.length === 0 ? (
          <Box padding={8}>
            <Flex justifyContent="center" alignItems="center" direction="column" gap={2}>
              <Typography variant="beta" textColor="neutral500">
                No suppliers found
              </Typography>
              <Typography variant="omega" textColor="neutral400">
                Add suppliers to start syncing products
              </Typography>
            </Flex>
          </Box>
        ) : (
          <Box>
            {suppliers.map((supplier) => (
              <Box
                key={supplier.id}
                padding={4}
                marginBottom={4}
                background="neutral0"
                shadow="filterShadow"
                borderRadius="4px"
              >
                <Flex direction="row" justifyContent="space-between" alignItems="center">
                  {/* Supplier Info */}
                  <Box>
                    <Flex direction="column" gap={2}>
                      <Typography variant="delta" fontWeight="bold">
                        {supplier.code} - {supplier.name}
                      </Typography>
                      
                      <Flex gap={4} alignItems="center">
                        <Flex alignItems="center" gap={1}>
                          <Typography variant="sigma" fontWeight="bold">Status:</Typography>
                          <Badge backgroundColor={supplier.is_active ? 'success100' : 'neutral100'}>
                            {supplier.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </Flex>

                        <Flex alignItems="center" gap={1}>
                          <Typography variant="sigma" fontWeight="bold">Auto Import:</Typography>
                          <Badge backgroundColor={supplier.auto_import ? 'success100' : 'neutral100'}>
                            {supplier.auto_import ? 'On' : 'Off'}
                          </Badge>
                        </Flex>

                        <Flex alignItems="center" gap={1}>
                          <Typography variant="sigma" fontWeight="bold">Last Sync:</Typography>
                          <Typography variant="pi">
                            {formatDate(supplier.last_sync)}
                          </Typography>
                        </Flex>

                        <Flex alignItems="center" gap={1}>
                          <Typography variant="sigma" fontWeight="bold">Sync Status:</Typography>
                          <Badge backgroundColor={getSyncStatusColor(supplier.sync_status) + '100'}>
                            {supplier.sync_status || 'Never'}
                          </Badge>
                        </Flex>

                        {supplier.product_count && (
                          <Flex alignItems="center" gap={1}>
                            <Typography variant="sigma" fontWeight="bold">Products:</Typography>
                            <Typography variant="pi">
                              {supplier.product_count}
                            </Typography>
                          </Flex>
                        )}
                      </Flex>
                    </Flex>
                  </Box>

                  {/* Sync Button */}
                  <Box>
                    <Button
                      variant="secondary"
                      startIcon={<Play />}
                      onClick={() => syncSupplier(supplier.documentId, supplier.name)}
                      disabled={!supplier.is_active || syncing[supplier.documentId]}
                      loading={syncing[supplier.documentId]}
                    >
                      {syncing[supplier.documentId] ? 'Syncing...' : 'Sync Now'}
                    </Button>
                  </Box>
                </Flex>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default SyncDashboard;
