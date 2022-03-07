import React, {
  useRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import type { StepsProps, FormInstance } from 'antd';
import { Form, Steps, ConfigProvider, Button, Space } from 'antd';
import toArray from 'rc-util/lib/Children/toArray';
import type { FormProviderProps } from 'antd/lib/form/context';
import useMergedState from 'rc-util/lib/hooks/useMergedState';
import classNames from 'classnames';
import { ConfigProviderWrap, useIntl } from '@ant-design/pro-provider';
import { merge, useRefFunction } from '@ant-design/pro-utils';

import type { StepFormProps } from './StepForm';
import StepForm from './StepForm';
import './index.less';
import type { ProFormProps } from '../ProForm';
import type { SubmitterProps } from '../../components';

type StepsFormProps<T = Record<string, any>> = {
  /**
   * 返回 true 会重置步数，并且清空表单
   *
   * @name 提交方法
   */
  onFinish?: (values: T) => Promise<boolean | void>;
  current?: number;
  stepsProps?: StepsProps;
  formProps?: ProFormProps<T>;
  onCurrentChange?: (current: number) => void;
  /** 自定义步骤器 */
  stepsRender?: (
    steps: {
      key: string;
      title?: React.ReactNode;
    }[],
    defaultDom: React.ReactNode,
  ) => React.ReactNode;
  /** @name 当前展示表单的 formRef */
  formRef?: React.MutableRefObject<FormInstance<any> | undefined>;
  /** @name 所有表单的 formMapRef */
  formMapRef?: React.MutableRefObject<React.MutableRefObject<FormInstance<any> | undefined>[]>;
  /**
   * 自定义单个表单
   *
   * @param form From 的 dom，可以放置到别的位置
   */
  stepFormRender?: (from: React.ReactNode) => React.ReactNode;

  /**
   * 自定义整个表单区域
   *
   * @param form From 的 dom，可以放置到别的位置
   * @param submitter 操作按钮
   */
  stepsFormRender?: (from: React.ReactNode, submitter: React.ReactNode) => React.ReactNode;
  /** 按钮的统一配置，优先级低于分步表单的配置 */
  submitter?:
    | SubmitterProps<{
        step: number;
        onPre: () => void;
        form?: FormInstance<any>;
      }>
    | false;

  containerStyle?: React.CSSProperties;
} & FormProviderProps;

export const StepsFormProvide = React.createContext<
  | {
      unRegForm: (name: string) => void;
      onFormFinish: (name: string, formData: any) => void;
      keyArray: string[];
      formArrayRef: React.MutableRefObject<React.MutableRefObject<FormInstance<any> | undefined>[]>;
      loading: boolean;
      setLoading: (loading: boolean) => void;
      lastStep: boolean;
      formMapRef: React.MutableRefObject<Map<string, StepFormProps>>;
      next: () => void;
    }
  | undefined
>(undefined);
function StepsForm<T = Record<string, any>>(
  props: StepsFormProps<T> & {
    children: any;
  },
) {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  const prefixCls = getPrefixCls('pro-steps-form');

  const {
    current,
    onCurrentChange,
    submitter,
    stepsFormRender,
    stepsRender,
    stepFormRender,
    stepsProps,
    onFinish,
    formProps,
    containerStyle,
    formRef,
    formMapRef: propsFormMapRef,
    ...rest
  } = props;

  const formDataRef = useRef(new Map<string, Record<string, any>>());
  const formMapRef = useRef(new Map<string, StepFormProps>());
  const formArrayRef = useRef<React.MutableRefObject<FormInstance<any> | undefined>[]>([]);
  const [formArray, setFormArray] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const intl = useIntl();

  /** 受控的方式来操作表单 */
  const [step, setStep] = useMergedState<number>(0, {
    value: props.current,
    onChange: props.onCurrentChange,
  });

  const lastStep = useMemo(() => step === formArray.length - 1, [formArray.length, step]);

  /**
   * 注册一个form进入，方便进行 props 的修改
   */
  const regForm = useCallback((name: string, childrenFormProps: StepFormProps) => {
    if (!formMapRef.current.has(name)) {
      setFormArray((oldFormArray) => [...oldFormArray, name]);
    }
    formMapRef.current.set(name, childrenFormProps);
  }, []);

  /**
   * 解除挂载掉这个 form，同时步数 -1
   */
  const unRegForm = useCallback((name: string) => {
    setFormArray((oldFormArray) => oldFormArray.filter((n) => n === name));
    formMapRef.current.delete(name);
    formDataRef.current.delete(name);
  }, []);

  useImperativeHandle(propsFormMapRef, () => formArrayRef.current);

  useImperativeHandle(
    formRef,
    () => {
      return formArrayRef.current[step || 0]?.current;
    },
    [step],
  );

  /**
   * ProForm处理了一下 from 的数据，在其中做了一些操作 如果使用 Provider 自带的，自带的数据处理就无法生效了
   */
  const onFormFinish = useCallback(
    async (name: string, formData: any) => {
      formDataRef.current.set(name, formData);
      // 如果不是最后一步
      if (!lastStep || !onFinish) {
        return;
      }

      setLoading(true);
      const values: any = merge({}, ...Array.from(formDataRef.current.values()));
      try {
        const success = await onFinish(values);
        if (success) {
          setStep(0);
          formArrayRef.current.forEach((form) => form.current?.resetFields());
        }
      } catch (error) {
        console.log(error);
      } finally {
        setLoading(false);
      }
    },
    [lastStep, onFinish, setLoading, setStep],
  );

  const stepsDom = useMemo(
    () => (
      <div
        className={`${prefixCls}-steps-container`}
        style={{
          maxWidth: Math.min(formArray.length * 320, 1160),
        }}
      >
        <Steps {...stepsProps} current={step} onChange={undefined}>
          {formArray.map((item) => {
            const itemProps = formMapRef.current.get(item);
            return <Steps.Step key={item} title={itemProps?.title} {...itemProps?.stepProps} />;
          })}
        </Steps>
      </div>
    ),
    [formArray, prefixCls, step, stepsProps],
  );

  const onSubmit = useRefFunction(() => {
    const from = formArrayRef.current[step];
    from.current?.submit();
  });

  /** 上一页功能 */
  const prePage = useRefFunction(() => {
    if (step < 1) return;
    setStep(step - 1);
  });

  const next = useMemo(() => {
    return (
      submitter !== false && (
        <Button
          key="next"
          type="primary"
          loading={loading}
          {...submitter?.submitButtonProps}
          onClick={() => {
            submitter?.onSubmit?.();
            onSubmit();
          }}
        >
          {intl.getMessage('stepsForm.next', '下一步')}
        </Button>
      )
    );
  }, [intl, loading, onSubmit, submitter]);

  const pre = useMemo(() => {
    return (
      submitter !== false && (
        <Button
          key="pre"
          {...submitter?.resetButtonProps}
          onClick={() => {
            prePage();
            submitter?.onReset?.();
          }}
        >
          {intl.getMessage('stepsForm.prev', '上一步')}
        </Button>
      )
    );
  }, [intl, prePage, submitter]);

  const submit = useMemo(() => {
    return (
      submitter !== false && (
        <Button
          key="submit"
          type="primary"
          loading={loading}
          {...submitter?.submitButtonProps}
          onClick={() => {
            submitter?.onSubmit?.();
            onSubmit();
          }}
        >
          {intl.getMessage('stepsForm.submit', '提交')}
        </Button>
      )
    );
  }, [intl, loading, onSubmit, submitter]);

  const getActionButton = useRefFunction(() => {
    const index = step || 0;
    if (index < 1) {
      return [next] as JSX.Element[];
    }
    if (index + 1 === formArray.length) {
      return [pre, submit] as JSX.Element[];
    }
    return [pre, next] as JSX.Element[];
  });

  const nextPage = useRefFunction(() => {
    if (step > formArray.length - 2) return;
    setStep(step + 1);
  });

  const renderSubmitter = () => {
    if (submitter && submitter.render) {
      const submitterProps: any = {
        form: formArrayRef.current[step]?.current,
        onSubmit,
        step,
        onPre: prePage,
      };

      return submitter.render(submitterProps, getActionButton()) as React.ReactNode;
    }
    if (submitter && submitter?.render === false) {
      return null;
    }
    return getActionButton();
  };

  const formDom = useMemo(() => {
    return toArray(props.children).map((item, index) => {
      const itemProps = item.props as StepFormProps;
      const name = itemProps.name || `${index}`;
      regForm(name, itemProps);
      /** 是否是当前的表单 */
      const isShow = step === index;

      const config = isShow
        ? {
            contentRender: stepFormRender,
            submitter: false,
          }
        : {};
      return (
        <div
          className={classNames(`${prefixCls}-step`, {
            [`${prefixCls}-step-active`]: isShow,
          })}
          key={name}
        >
          {React.cloneElement(item, {
            ...config,
            ...formProps,
            ...itemProps,
            name,
            step: index,
            key: name,
          })}
        </div>
      );
    });
  }, [formProps, prefixCls, props.children, regForm, step, stepFormRender]);

  const finalStepsDom = useMemo(
    () =>
      props.stepsRender
        ? props.stepsRender(
            formArray.map((item) => ({
              key: item,
              title: formMapRef.current.get(item)?.title,
            })),
            stepsDom,
          )
        : stepsDom,
    [formArray, props, stepsDom],
  );

  const submitterDom = renderSubmitter();

  return (
    <div className={prefixCls}>
      <Form.Provider {...rest}>
        <StepsFormProvide.Provider
          value={{
            loading,
            setLoading,
            keyArray: formArray,
            next: nextPage,
            formArrayRef,
            formMapRef,
            lastStep,
            unRegForm,
            onFormFinish,
          }}
        >
          {stepsFormRender ? (
            stepsFormRender(
              <>
                {finalStepsDom}
                <div className={`${prefixCls}-container`} style={containerStyle}>
                  {formDom}
                </div>
              </>,
              submitterDom,
            )
          ) : (
            <>
              {finalStepsDom}
              <div className={`${prefixCls}-container`} style={containerStyle}>
                {formDom}
                <Space>{renderSubmitter()}</Space>
              </div>
            </>
          )}
        </StepsFormProvide.Provider>
      </Form.Provider>
    </div>
  );
}

export type { StepFormProps, StepsFormProps };

function StepsFormWarp<T = Record<string, any>>(
  props: StepsFormProps<T> & {
    children: any;
  },
) {
  return (
    <ConfigProviderWrap>
      <StepsForm<T> {...props} />
    </ConfigProviderWrap>
  );
}

StepsFormWarp.StepForm = StepForm;
StepsFormWarp.useForm = Form.useForm;

export { StepsFormWarp as StepsForm };
