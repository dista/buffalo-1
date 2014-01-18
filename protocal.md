# notation
* p-s: message sent from phone to server
* s-d: message sent from server to device


# 1. heartbeat(p-s)

    request:  18 bytes                                  response:  12 bytes
    
    start_code: 0x97            -- 0                    start_code: 0x97       -- 0
    type: 0x10                  -- 1                    type: 0x10             -- 1
    packet_id: 4 bytes          -- 2                    packet_id: 4 bytes     -- 2
    len: 2 bytes                -- 6                    len: 2 bytes           -- 6
    session_id: 8 bytes         -- 8                    result: 1 byte         -- 8
    verify_byte: 1 byte         -- 16                   error_code: 1 byte     -- 9
    end_byte: 0x99              -- 17                   verify_byte: 1 byte    -- 10
                                                        end_byte: 0x99         -- 11
                                                   
# 2. login(p-s)

    request:  18 bytes                                  response:  12 bytes
    
    start_code: 0x97                                    start_code: 0x97 
    type: 0x11                                          type: 0x11 
    packet_id: 4 bytes                                  packet_id: 4 bytes 
    len: 2 bytes                                        len: 2 bytes 
    username/email: variable bytes                      result: 1 byte 
    sep: '/'                                            session_id/error_code: 8 bytes/1 byte
    password: variable bytes                            devices_list: variable bytes
    end_char: 0x27                                      if_change_ip: 1 byte
    verify_byte: 1 byte                                 ip: 4 byte
    end_byte: 0x99                                      verify_byte: 1 byte 
                                                        end_byte: 0x99
                                                        
                                                        devices_list format:
                                                        device_number: 1 byte
                                                        device_infos: device_number * device_info
                                                        
                                                        device_info format:
                                                        device_id: 12 bytes
                                                        ssid: at most 32 bytes
                                                        ssid_end: 0x27
                                                        state: 1 byte
                                                        temperature: 1 byte
                                                        humidity: 1 byte
                                                        battery: 2 bytes
                                                        locked: 1 byte
                                                        online: 1 byte
                                                        time_table: variable bytes
                                                        
                                                        time_table format:
                                                        time_table_number: 1 byte
                                                        time_table_id: 1 byte
                                                        time_start: 2 bytes BCD
                                                        time_end: 2 bytes BCD
                                                        repeat: 1 byte, 0 means not repeat, bit X means repeat on X day
                                                        

# 3. register account(p-s)

    request:
    start_code: 0x97                                    start_code: 0x97 
    type: 0x12                                          type: 0x12 
    packet_id: 4 bytes                                  packet_id: 4 bytes
    len: 2 bytes                                        len: 2 bytes 
    username: variable bytes
    sep: '/'
    email: variable bytes
    sep: '/'
    password: variable bytes
    end_char: 0x27
    verify_byte: 1 byte
    end_byte: 1 byte
