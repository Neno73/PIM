import React from 'react';
import { useCMEditViewDataManager } from '@strapi/helper-plugin';

const EditViewEnhancer = () => {
  const { slug } = useCMEditViewDataManager();
  
  // Add sync button for suppliers
  if (slug === 'api::supplier.supplier') {
    return (
      <div style={{ padding: '16px', background: '#f6f6f9', borderRadius: '4px', margin: '16px 0' }}>
        <h4>Promidata Sync Actions</h4>
        <button 
          style={{
            background: '#4945ff',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '8px'
          }}
          onClick={() => {
            window.open('/admin/plugins/sync-dashboard', '_blank');
          }}
        >
          Open Sync Dashboard
        </button>
        <button 
          style={{
            background: '#28a745',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onClick={() => {
            alert('Sync functionality - Connect to sync API');
          }}
        >
          Sync This Supplier
        </button>
      </div>
    );
  }
  
  return null;
};

export default EditViewEnhancer;